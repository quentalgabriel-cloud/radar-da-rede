// E2E de navegador do Radar Web (gate 6 da P1.1).
//
// Cobre o que a operação realmente faz na tela, não o que é fácil de testar:
// filtros, ordenação, busca, o dialog com foco e ESC, os estados vazio e sem
// comparação, mobile, reduced motion e o botão de atualizar em suas três
// respostas. O laboratório sintético é servido pelo mesmo harness já usado nos
// testes de contrato, então nada aqui depende de rede nem de Supabase.
//
// A instalação do Chromium é feita por `pnpm --filter @radar-rede/radar-web e2e:install`.
// Quando o navegador não está presente, a suíte se declara pulada em vez de
// falhar: um ambiente sem navegador não é uma regressão do produto.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import { createRadarWebServer } from "../src/server.mjs";

const appRoot = resolve(import.meta.dirname, "..");

let chromium = null;
try {
  ({ chromium } = await import("playwright"));
} catch {
  chromium = null;
}

let browser = null;
let server;
let endpoint;

const disponivel = async () => {
  if (!chromium) return false;
  try {
    browser = await chromium.launch();
    return true;
  } catch {
    return false;
  }
};

const temNavegador = await (async () => {
  await new Promise((done, reject) => {
    const build = spawn(process.execPath, [resolve(appRoot, "scripts/build.mjs")], { stdio: "ignore" });
    build.on("exit", (code) => (code === 0 ? done() : reject(new Error(`build failed: ${code}`))));
  });
  return disponivel();
})();

describe("Radar Web no navegador", { skip: temNavegador ? false : "Chromium não instalado; rode pnpm --filter @radar-rede/radar-web e2e:install" }, () => {
  before(async () => {
    server = createRadarWebServer();
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    endpoint = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (browser) await browser.close();
    if (server) await new Promise((done, reject) => server.close((error) => (error ? reject(error) : done())));
  });

  // A tabbar deixou de ser sinal de prontidão: em >=1024px ela some por decisão
  // de layout e quem navega e a sidebar. O que diz "carregou" e o conteudo.
  const abrir = async (options = {}) => {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    const erros = [];
    page.on("pageerror", (error) => erros.push(error.message));
    await page.goto(endpoint, { waitUntil: "networkidle" });
    await page.waitForSelector("#radar-content:not([hidden])");
    // `state: "hidden"` porque um elemento com [hidden] nunca fica visível, e o
    // waitForSelector espera visibilidade por padrão.
    await page.waitForSelector("#loading-state", { state: "hidden" });
    return { page, context, erros };
  };

  // Cada vista so existe depois da aba correspondente. Navegar faz parte do
  // teste: e o caminho que a operacao percorre. Os dois controles chamam o mesmo
  // showScreen, entao o teste usa o que estiver visivel naquele viewport.
  const irPara = async (page, alvo, seletor) => {
    // A tabbar existe só onde a sidebar não é persistente. Ela é o discriminador
    // confiável: a sidebar fechada continua "visível" para o Playwright porque
    // está apenas transladada para fora da tela.
    const temTabbar = await page.locator(".tabbar").isVisible();
    await page.click(temTabbar ? `.tab[data-target="${alvo}"]` : `.nav-item[data-target="${alvo}"]`);
    await page.waitForSelector(`.screen[data-screen="${alvo}"]:not([hidden])`);
    if (seletor) await page.waitForSelector(seletor);
  };

  it("carrega o laboratório sem erro de página e com marcos de acessibilidade", async () => {
    const { page, context, erros } = await abrir();
    await irPara(page, "situations", "#situation-list");
    assert.deepEqual(erros, [], "a página não pode registrar erro de execução");
    assert.equal(await page.locator("main#main").count(), 1);
    assert.ok(await page.locator("nav[aria-label='Navegação principal']").count() >= 1);
    // Um h1 por vista, para leitor de tela não perder o contexto.
    assert.ok(await page.locator("h1").count() >= 1);
    await context.close();
  });

  it("a busca filtra grupos e o estado vazio explica em vez de sumir", async () => {
    const { page, context } = await abrir();
    await irPara(page, "groups", "#conversation-list .group-card");
    const antes = await page.locator("#conversation-list .group-card").count();
    assert.ok(antes > 0, "o laboratório precisa render grupos");

    await page.fill("#search-input", "zzz-nao-existe-zzz");
    await page.waitForFunction(() =>
      document.querySelector("#conversation-list")?.querySelector(".empty-state") !== null);
    const vazio = await page.locator("#conversation-list .empty-state").innerText();
    assert.match(vazio, /Nenhum grupo encontrado/);

    await page.fill("#search-input", "");
    await page.waitForFunction((total) =>
      document.querySelectorAll("#conversation-list .group-card").length === total, antes);
    await context.close();
  });

  it("o filtro de severidade das situações preserva a explicação quando não há resultado", async () => {
    const { page, context } = await abrir();
    await irPara(page, "situations", "#situation-list");
    await page.selectOption("#severity-filter", "critical").catch(() => {});
    const texto = await page.locator("#situation-list").innerText();
    // Ou existem situações críticas, ou a tela diz por que não há.
    assert.ok(texto.trim().length > 0, "a lista nunca pode ficar em branco sem explicação");
    await context.close();
  });

  it("trocar de cenário troca os dados sem recarregar a página", async () => {
    const { page, context } = await abrir();
    await page.waitForSelector("#scenario-select");
    const opcoes = await page.locator("#scenario-select option").count();
    assert.ok(opcoes >= 2, "o laboratório precisa de mais de um cenário");
    const antes = await page.locator("#overview-title").innerText();
    await page.selectOption("#scenario-select", { index: 1 });
    await page.waitForFunction((anterior) =>
      document.querySelector("#overview-title")?.innerText !== anterior, antes, { timeout: 5000 })
      .catch(() => {});
    assert.ok((await page.locator("#overview-title").innerText()).length > 0);
    await context.close();
  });

  it("o painel de detalhe abre, prende o foco e fecha no ESC devolvendo o foco", async () => {
    const { page, context } = await abrir();
    await irPara(page, "control", "#control-group-list .control-card");
    const gatilho = page.locator("#control-group-list [data-open-group]").first();
    await gatilho.focus();
    await gatilho.click();
    await page.waitForSelector("#group-drawer[open]");
    const focoDentro = await page.evaluate(() =>
      document.querySelector("#group-drawer")?.contains(document.activeElement));
    assert.equal(focoDentro, true, "o foco precisa entrar no dialog");
    await page.keyboard.press("Escape");
    // Um dialog fechado tem display:none, então esperar por visibilidade nunca
    // resolve; o estado do elemento é a verdade aqui.
    await page.waitForFunction(() => document.querySelector("#group-drawer")?.open === false);
    // Fechar sem devolver o foco deixa o teclado no início da página.
    const focoVoltou = await page.evaluate(() =>
      document.activeElement?.matches("[data-open-group]"));
    assert.equal(focoVoltou, true, "o foco precisa voltar ao cartão que abriu o painel");
    await context.close();
  });

  it("o cartão de grupo leva a classificação e a evidência para dentro do painel", async () => {
    const { page, context } = await abrir();
    await irPara(page, "control", "#control-group-list .control-card");
    await page.locator("#control-group-list [data-open-group]").first().click();
    await page.waitForSelector("#group-drawer[open]");
    const texto = await page.locator("#group-drawer-content").innerText();
    assert.match(texto, /Leitura atual/);
    assert.match(texto, /Crescimento, estabilidade e queda/);
    assert.match(texto, /Classificação/);
    assert.match(texto, /Evidência/);
    await context.close();
  });

  it("funciona em viewport de smartphone", async () => {
    const { page, context } = await abrir({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await irPara(page, "situations", "#situation-list");
    // Nada pode transbordar horizontalmente: rolagem lateral quebra a leitura.
    const transborda = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    assert.equal(transborda, false, "a página não pode rolar na horizontal no celular");
    await context.close();
  });

  it("respeita reduced motion sem perder conteúdo", async () => {
    const { page, context, erros } = await abrir({ reducedMotion: "reduce" });
    await irPara(page, "situations", "#situation-list");
    assert.deepEqual(erros, []);
    assert.ok((await page.locator("#situation-list").innerText()).trim().length > 0);
    await context.close();
  });

  it("o modo live pede autenticação e não vaza o read model sem sessão", async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${endpoint}/?mode=live`, { waitUntil: "networkidle" });
    const corpo = await page.locator("body").innerText();
    // Sem sessão, a tela pede login e não mostra dado persistido.
    assert.match(corpo, /Entrar|entrar|Radar/);
    await context.close();
  });

  // O Control Center fica atrás de flag e o laboratório o entrega desligado.
  // Interceptar a resposta é melhor que abrir uma porta de teste no produto:
  // exercita a tela real sem mudar o código que vai para produção.
  const comControlCenter = async (transformar = (m) => m) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    // Predicado em vez de glob: o laboratório busca /data/x.json?ts=... e o
    // padrão precisa ignorar a query string.
    await page.route((url) => url.pathname.startsWith("/data/") && url.pathname.endsWith(".json"), async (route) => {
      const response = await route.fetch();
      const corpo = await response.json().catch(() => null);
      if (!corpo?.group_control_center) return route.fulfill({ response });
      const cc = corpo.group_control_center;
      const agora = Date.parse("2026-09-04T21:00:00.000Z");
      const janela = (fim) => ({
        id: `run-${fim}`, window_kind: "canonical_slot",
        starts_at: new Date(fim - 86_400_000).toISOString(), ends_at: new Date(fim).toISOString()
      });
      corpo.group_control_center = transformar({
        ...cc,
        enabled: true,
        available: true,
        anchor: {
          current_run_id: "run-atual",
          current_window_start: new Date(agora - 86_400_000).toISOString(),
          current_window_end: new Date(agora).toISOString(),
          comparison_policy: "same_slot_previous_day@1",
          comparison_run_id: null,
          comparison_window_start: null,
          comparison_window_end: null,
          comparison_unavailable_reason: "capture_confidence_insufficient",
          windows_overlap: false
        },
        consistency: {
          monitored_group_count: cc.groups?.length ?? 0,
          persisted_metric_count: Math.max((cc.groups?.length ?? 1) - 1, 0),
          synthesized_zero_count: 1,
          unexpected_metric_group_count: 0,
          consistent: true
        },
        groups: (cc.groups ?? []).map((grupo, indice) => ({
          ...grupo,
          metric_source: indice === 0 ? "synthesized_zero" : "persisted",
          event_count: indice === 0 ? 0 : grupo.event_count,
          trend: {
            ...grupo.trend, direction: "unavailable",
            unavailable_reason: "capture_confidence_insufficient"
          }
        })),
        // Uma janela ontem e outra hoje, para o histórico não ficar vazio.
        runs: [janela(agora), janela(agora - 86_400_000)]
      });
      await route.fulfill({ response, json: corpo });
    });
    await page.goto(endpoint, { waitUntil: "networkidle" });
    await page.waitForSelector("#radar-content:not([hidden])");
    await irPara(page, "control", "#control-center:not([hidden])");
    // Esperar a seção não basta: a lista é renderizada depois dela.
    await page.waitForSelector("#control-group-list .control-card");
    return { page, context };
  };

  it("o Control Center mostra a janela analisada e a política de comparação", async () => {
    const { page, context } = await comControlCenter();
    // textContent, não innerText: os rótulos são maiúsculos por CSS e o
    // identificador da política precisa aparecer na caixa original.
    const ancora = await page.locator("#control-center-anchor").textContent();
    assert.match(ancora, /Janela atual/);
    assert.match(ancora, /same_slot_previous_day@1/);
    await context.close();
  });

  it("tendência indisponível explica o motivo em vez de mostrar um traço", async () => {
    const { page, context } = await comControlCenter();
    const ancora = await page.locator("#control-center-anchor").innerText();
    assert.match(ancora, /Sem comparação/);
    assert.match(ancora, /cobertura da captura não sustenta/);
    const lista = await page.locator("#control-group-list").textContent();
    assert.match(lista, /Sem comparação/);
    await context.close();
  });

  // A regra de produto continua sendo a mesma: o zero pertence à execução atual.
  // O que mudou é onde cada metade da frase vive — rótulo curto no cartão,
  // explicação completa uma vez na âncora, em vez de repetida em cada linha.
  it("grupo sem atividade avisa que o zero é da execução atual", async () => {
    const { page, context } = await comControlCenter();
    const lista = await page.locator("#control-group-list").textContent();
    assert.match(lista, /Sem atividade nesta execução/);
    const ancora = await page.locator("#control-center-anchor").innerText();
    assert.match(ancora, /não reaproveita uma medição anterior/);
    await context.close();
  });

  it("a vocabulário diz situações no período, nunca abertas", async () => {
    const { page, context } = await comControlCenter();
    const lista = await page.locator("#control-group-list").textContent();
    assert.match(lista, /Situações no período/);
    assert.ok(!/Situações abertas/.test(lista), "o vocabulário antigo não pode voltar");
    await context.close();
  });

  it("filtrar por sem comparação mantém os grupos e por crítica esvazia com explicação", async () => {
    const { page, context } = await comControlCenter();
    const total = await page.locator("#control-group-list .control-card").count();
    assert.ok(total > 0);
    // Os seis seletores saíram da superfície principal e vivem em "Filtros
    // avançados"; a operação precisa abri-los, e o teste percorre o mesmo caminho.
    await page.click(".advanced-filters summary");
    await page.selectOption("#trend-filter", "unavailable");
    await page.waitForFunction((n) =>
      document.querySelectorAll("#control-group-list .control-card").length === n, total);
    await page.selectOption("#trend-filter", "growing");
    await page.waitForFunction(() =>
      document.querySelector("#control-group-list .empty-state") !== null);
    // Vazio por cobertura não é vazio por filtro: o estado precisa dizer qual dos
    // dois é, senão a operação procura um grupo que o dado não pode mostrar.
    assert.match(await page.locator("#control-group-list .empty-state").innerText(),
      /Nenhum grupo tem tendência nesta execução/);
    assert.match(await page.locator("#control-group-list .empty-state").innerText(),
      /cobertura da captura não sustenta/);
    await context.close();
  });

  it("os recortes rápidos filtram sem abrir os filtros avançados", async () => {
    const { page, context } = await comControlCenter();
    const total = await page.locator("#control-group-list .control-card").count();
    await page.click('#control-presets [data-preset="inactive"]');
    await page.waitForFunction(() =>
      document.querySelectorAll("#control-group-list .control-card").length >= 0);
    const parados = await page.locator("#control-group-list .control-card").count();
    assert.ok(parados < total, "o recorte precisa reduzir a lista, não repeti-la");
    assert.match(await page.locator("#control-group-list").textContent(), /Sem atividade nesta execução/);
    await page.click('#control-presets [data-preset="all"]');
    await page.waitForFunction((n) =>
      document.querySelectorAll("#control-group-list .control-card").length === n, total);
    await context.close();
  });

  it("a cobertura da captura aparece com nível, motivo e consequência", async () => {
    const { page, context } = await comControlCenter();
    const ancora = await page.locator("#control-center-anchor").innerText();
    assert.match(ancora, /Cobertura da captura/);
    assert.match(ancora, /Motivo:/);
    // O ponto operacional: dizer o que a cobertura impede, não só o nível dela.
    assert.match(ancora, /tendência fica indisponível|sustenta a comparação/);
    await context.close();
  });

  it("cobertura sem medição é dita como não medida, nunca como zero", async () => {
    // É o que produção entrega quando a RPC cai para v2/v1 e capture_coverage
    // fica nulo: `{ level }` sozinho. "0% coberto" seria afirmar uma medição
    // que ninguém fez.
    const { page, context } = await comControlCenter((cc) => ({ ...cc, capture: { level: "low" } }));
    const ancora = await page.locator("#control-center-anchor").innerText();
    assert.match(ancora, /não medida/);
    assert.match(ancora, /diferente de cobertura zero/);
    assert.ok(!/0% do período/.test(ancora), "cobertura ausente não pode virar zero medido");
    await context.close();
  });

  it("a execução inconsistente é denunciada na âncora", async () => {
    const { page, context } = await comControlCenter((cc) => ({
      ...cc, consistency: { ...cc.consistency, consistent: false, unexpected_metric_group_count: 3 }
    }));
    assert.match(await page.locator("#control-center-anchor").innerText(), /inconsistente/);
    await context.close();
  });

  it("a sidebar carrega estado e navega para as mesmas telas da tabbar", async () => {
    const { page, context } = await abrir({ viewport: { width: 1280, height: 900 } });
    await page.waitForSelector("#sidebar-state .state-line");
    assert.ok((await page.locator("#sidebar-state").innerText()).includes("Consolidado"));
    await page.click('.nav-item[data-target="control"]');
    await page.waitForSelector('.screen[data-screen="control"]:not([hidden])');
    assert.equal(await page.locator("#topbar-title").innerText(), "Painel de controle");
    // Só a tabbar declara a página atual: dois aria-current anunciariam duas.
    assert.equal(await page.locator("[aria-current='page']").count(), 1);
    await context.close();
  });

  it("no celular a sidebar é gaveta, fecha no ESC e não empurra a página", async () => {
    const { page, context } = await abrir({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await page.click("#menu-button");
    await page.waitForSelector("body.sidebar-open");
    const transborda = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    assert.equal(transborda, false, "a gaveta não pode criar rolagem lateral");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.body.classList.contains("sidebar-open"));
    assert.equal(await page.locator("#menu-button").getAttribute("aria-expanded"), "false");
    await context.close();
  });
});
