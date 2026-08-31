// Curated meeting templates (§11 backlog — daily, retro, 1:1)

const MEETING_TEMPLATES = [
  {
    id: "daily",
    label: "Daily / stand-up",
    suggestedMode: "passive",
    objective: "Sincronizar o time: ontem, hoje, impedimentos.",
    customPrompt:
      "Resumo focado em bloqueios, donos de ação e dependências entre pessoas."
  },
  {
    id: "retro",
    label: "Retrospectiva",
    suggestedMode: "passive",
    objective: "Refletir sobre o último ciclo e definir melhorias.",
    customPrompt:
      "Destaque o que funcionou, o que não funcionou e ações concretas com responsável."
  },
  {
    id: "one_on_one",
    label: "1:1",
    suggestedMode: "hybrid",
    objective: "Alinhamento individual, feedback e plano de carreira.",
    customPrompt: "Capture acordos, follow-ups e temas sensíveis de forma objetiva."
  },
  {
    id: "planning",
    label: "Planning / refinamento",
    suggestedMode: "passive",
    objective: "Priorizar backlog e alinhar escopo técnico.",
    customPrompt: "Liste histórias discutidas, estimativas e riscos técnicos."
  },
  {
    id: "review",
    label: "Review de entrega",
    suggestedMode: "passive",
    objective: "Validar entrega com stakeholders.",
    customPrompt: "Resuma demonstrações, perguntas abertas e próximos passos."
  },
  {
    id: "interview",
    label: "Entrevista técnica",
    suggestedMode: "active",
    objective:
      "Entrevista técnica com senior de desenvolvimento de software: captar perguntas do entrevistador e sugerir respostas claras.",
    customPrompt:
      "Contexto: entrevista técnica (senior software engineer). " +
      "Sugira respostas objetivas, estruturadas (contexto → abordagem → trade-offs → exemplo), " +
      "com profundidade de senior, sem inventar experiência pessoal falsa. " +
      "Priorize clareza para o candidato ler em voz alta em poucos segundos. " +
      "Use o perfil/basePrompt do usuário quando disponível."
  }
];

function listMeetingTemplates() {
  return MEETING_TEMPLATES.map((t) => ({ ...t }));
}

function getMeetingTemplate(templateId) {
  return MEETING_TEMPLATES.find((t) => t.id === templateId) || null;
}

function applyTemplateToSessionInput(templateId, input) {
  const template = getMeetingTemplate(templateId);
  if (!template) {
    return input;
  }
  return {
    ...input,
    objective: input.objective?.trim() ? input.objective : template.objective,
    customPrompt: input.customPrompt?.trim()
      ? input.customPrompt
      : template.customPrompt,
    mode: input.mode || template.suggestedMode
  };
}

module.exports = {
  listMeetingTemplates,
  getMeetingTemplate,
  applyTemplateToSessionInput
};
