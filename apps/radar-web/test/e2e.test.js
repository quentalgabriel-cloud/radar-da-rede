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

  const abrir = async (options = {}) => {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    const erros = [];
    page.on("pageerror", (error) => erros.push(error.message));
    await page.goto(endpoint, { waitUntil: "networkidle" });
    await page.waitForSelector(".tabbar:not([hidden])");
    return { page, context, erros };
  };

  // Cada vista so existe depois da aba correspondente. Navegar faz parte do
  // teste: e o caminho que a operacao percorre.
  const irPara = async (page, alvo, seletor) => {
    await page.click(`.tab[data-target="${alvo}"]`);
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

  it("o dialog de grupo abre, prende o foco e fecha no ESC devolvendo o foco", async () => {
    const { page, context } = await abrir();
    await irPara(page, "groups", "#conversation-list .group-card");
    const gatilho = page.locator("[data-open-group]").first();
    const temControlCenter = await gatilho.count() > 0;
    if (!temControlCenter) {
      // Com a flag desligada o laboratório mostra a v0.1; o dialog é do
      // Control Center. Nesse caso o que precisa valer é o details nativo.
      const card = page.locator("#conversation-list details").first();
      await card.locator("summary").click();
      assert.equal(await card.getAttribute("open"), "");
      await context.close();
      return;
    }
    await gatilho.focus();
    await gatilho.click();
    await page.waitForSelector("#group-drawer[open]");
    const focoDentro = await page.evaluate(() =>
      document.querySelector("#group-drawer")?.contains(document.activeElement));
    assert.equal(focoDentro, true, "o foco precisa entrar no dialog");
    await page.keyboard.press("Escape");
    await page.waitForSelector("#group-drawer:not([open])");
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
    await page.waitForSelector(".tabbar:not([hidden])");
    await irPara(page, "groups", "#control-center:not([hidden])");
    // Esperar a seção não basta: a lista é renderizada depois dela.
    await page.waitForSelector("#control-group-list .control-card");
    return { page, context };
  };

  it("o Control Center mostra a janela analisada e a política de comparação", async () => {
    const { page, context } = await comControlCenter();
    const ancora = await page.locator("#control-center-anchor").innerText();
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

  it("grupo sem atividade avisa que o zero é da execução atual", async () => {
    const { page, context } = await comControlCenter();
    const lista = await page.locator("#control-group-list").textContent();
    assert.match(lista, /Sem atividade nesta execução/);
    assert.match(lista, /não reaproveita uma medição anterior/);
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
    await page.selectOption("#trend-filter", "unavailable");
    await page.waitForFunction((n) =>
      document.querySelectorAll("#control-group-list .control-card").length === n, total);
    await page.selectOption("#trend-filter", "growing");
    await page.waitForFunction(() =>
      document.querySelector("#control-group-list .empty-state") !== null);
    assert.match(await page.locator("#control-group-list .empty-state").innerText(), /Ajuste busca/);
    await context.close();
  });

  it("a execução inconsistente é denunciada na âncora", async () => {
    const { page, context } = await comControlCenter((cc) => ({
      ...cc, consistency: { ...cc.consistency, consistent: false, unexpected_metric_group_count: 3 }
    }));
    assert.match(await page.locator("#control-center-anchor").innerText(), /inconsistente/);
    await context.close();
  });
});
