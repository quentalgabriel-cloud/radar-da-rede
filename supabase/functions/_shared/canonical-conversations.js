const invisibleCharacters = /[\u200b-\u200f\ufeff]/g;
// `mensagens?` casava "mensagens" e "mensagen", mas não "mensagem": em
// português o radical muda no singular. Um grupo com exatamente uma mensagem
// pendente escapava da normalização e virava uma identidade própria.
const cumulativeCountSuffix = /\s*\(\d+\s+mensage(?:m|ns)\)\s*$/i;

export const canonicalConversationLabel = (value) => {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKC")
    .replace(invisibleCharacters, "")
    .replace(cumulativeCountSuffix, "")
    .trim();
};

// Alguns títulos de notificação do WhatsApp incluem uma contagem cumulativa.
// Ela é apresentação, não identidade do grupo. Esta normalização é deliberadamente
// restrita a esse padrão e preserva o evento bruto no banco.
export const canonicalizeConversationEvent = (event) => {
  const label = canonicalConversationLabel(event?.conversation_label);
  if (!label) return event;
  return {
    ...event,
    conversation_id: `label:${label.toLocaleLowerCase("pt-BR")}`,
    conversation_label: label
  };
};

