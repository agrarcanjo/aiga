// Heuristic + LLM prompt helpers for meeting active mode (G3)

const DIRECTED_PATTERNS = [
  /\b(o que você acha|o que voce acha|what do you think|como você vê|como voce ve)\b/i,
  /\b(pode falar|can you|could you|você pode|voce pode)\b/i,
  /\b(sua opinião|sua opiniao|your opinion|what about you)\b/i,
  /\b(alguma ideia|any thoughts)\b/i
];

const YOU_PATTERNS = /\b(você|voce|tu|you)\b/i;

function normalizeAlias(alias) {
  return String(alias || "")
    .trim()
    .toLowerCase();
}

/**
 * Detecção rápida sem LLM — últimas frases do transcript.
 */
function heuristicDetectDirectedQuestion(transcript, aliases) {
  const normalizedAliases = (aliases || []).map(normalizeAlias).filter((a) => a.length >= 2);
  const chunks = transcript.split(/[.!?\n]+/).map((s) => s.trim()).filter((s) => s.length > 3);
  const recent = chunks.slice(-10);

  for (let i = recent.length - 1; i >= 0; i -= 1) {
    const line = recent[i];
    const hasQuestionMark = line.includes("?");
    const patternHit = DIRECTED_PATTERNS.some((re) => re.test(line));
    if (!hasQuestionMark && !patternHit) {
      continue;
    }

    const lower = line.toLowerCase();
    for (const alias of normalizedAliases) {
      if (lower.includes(alias)) {
        return {
          directed: true,
          questionText: line,
          confidence: 0.82,
          source: "heuristic"
        };
      }
    }

    if (YOU_PATTERNS.test(line) && (hasQuestionMark || patternHit)) {
      return {
        directed: true,
        questionText: line,
        confidence: 0.68,
        source: "heuristic"
      };
    }
  }

  return { directed: false, questionText: "", confidence: 0, source: "heuristic" };
}

function buildClassifierPrompt(transcriptTail, aliases, profile) {
  const aliasList = (aliases || []).filter(Boolean).join(", ") || "(não informado)";
  return (
    "Analise o trecho de transcript de reuniao abaixo.\n" +
    `Participante monitorado (apelidos/nome): ${aliasList}\n` +
    `Perfil: ${profile?.name || ""} — ${profile?.role || ""}\n\n` +
    "Responda APENAS com JSON valido (sem markdown):\n" +
    '{"directedToUser":boolean,"questionText":string,"confidence":number}\n' +
    "directedToUser=true se alguem parece fazer pergunta ou pedir opiniao DIRETAMENTE ao participante monitorado.\n" +
    "confidence entre 0 e 1.\n\n" +
    `Transcript (ultimos ~60s):\n${transcriptTail.slice(-4000)}`
  );
}

function parseClassifierResponse(text) {
  const raw = String(text || "").trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { directed: false, questionText: "", confidence: 0, source: "llm" };
  }
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const directed = Boolean(parsed.directedToUser);
    const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.5;
    const questionText = String(parsed.questionText || "").trim();
    if (!directed || confidence < 0.45) {
      return { directed: false, questionText: "", confidence: 0, source: "llm" };
    }
    return { directed: true, questionText, confidence, source: "llm" };
  } catch {
    return { directed: false, questionText: "", confidence: 0, source: "llm" };
  }
}

const SUGGESTION_PROMPT_PREFIX =
  "Voce ajuda o participante a responder uma pergunta feita a ele em reuniao. " +
  "Responda em 2-4 frases objetivas, tom profissional, no idioma da pergunta. " +
  "Nao invente fatos fora do contexto.\n\n";

const INTERVIEW_SUGGESTION_PREFIX =
  "Voce e um coach de entrevista tecnica para um candidato senior de software. " +
  "Com base na pergunta do entrevistador, escreva uma sugestao de resposta que o candidato possa falar. " +
  "Estruture em 3-6 frases (ou bullets curtos): tese, abordagem, trade-offs, exemplo concreto. " +
  "Tom confiante e tecnico, no idioma da pergunta. Nao invente empresas/projetos especificos do candidato. " +
  "Nao inclua meta-comentarios (ex.: 'voce poderia dizer').\n\n";

/**
 * Em entrevista, qualquer pergunta recente do entrevistador importa (nao so "voce/apelido").
 */
function heuristicDetectInterviewQuestion(transcript) {
  const chunks = transcript
    .split(/[.!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8);
  const recent = chunks.slice(-12);

  for (let i = recent.length - 1; i >= 0; i -= 1) {
    const line = recent[i];
    const hasQuestionMark = line.includes("?");
    const looksLikePrompt =
      /^(como|what|how|why|explique|explain|describe|diff|diferenc|compare|quando|when|qual|which)\b/i.test(
        line
      ) ||
      /\b(trade-?off|complexidade|complexit|arquitetura|architecture|design pattern|latency|escala|scale)\b/i.test(
        line
      );

    if (hasQuestionMark || looksLikePrompt) {
      return {
        directed: true,
        questionText: line,
        confidence: hasQuestionMark ? 0.78 : 0.62,
        source: "heuristic-interview"
      };
    }
  }

  return { directed: false, questionText: "", confidence: 0, source: "heuristic-interview" };
}

function buildInterviewClassifierPrompt(transcriptTail, profile) {
  return (
    "Analise o trecho de transcript de uma ENTREVISTA TECNICA.\n" +
    `Candidato: ${profile?.name || ""} — ${profile?.role || "software engineer"}\n\n` +
    "Responda APENAS com JSON valido (sem markdown):\n" +
    '{"directedToUser":boolean,"questionText":string,"confidence":number}\n' +
    "directedToUser=true se o entrevistador fez uma pergunta tecnica ou pediu explicacao/comparacao " +
    "que o candidato deveria responder (mesmo sem citar o nome do candidato).\n" +
    "confidence entre 0 e 1.\n\n" +
    `Transcript (ultimos ~60s):\n${transcriptTail.slice(-4000)}`
  );
}

function buildSuggestionPrompt(questionText, profile, objective, transcriptTail, options) {
  const isInterview = options?.templateId === "interview";
  const customPrompt = String(options?.customPrompt || "").trim();
  const prefix = isInterview ? INTERVIEW_SUGGESTION_PREFIX : SUGGESTION_PROMPT_PREFIX;
  const basePrompt = String(profile?.basePrompt || "").trim();

  return (
    `${prefix}` +
    `Perfil: ${profile?.name || ""} (${profile?.role || ""})\n` +
    `Objetivo: ${objective || "(nao informado)"}\n` +
    (basePrompt ? `Contexto do candidato:\n${basePrompt.slice(0, 1200)}\n` : "") +
    (customPrompt ? `Instrucoes extras:\n${customPrompt.slice(0, 1200)}\n` : "") +
    `\nPergunta detectada: "${questionText}"\n\n` +
    `Contexto recente:\n${transcriptTail.slice(-2500)}`
  );
}

module.exports = {
  heuristicDetectDirectedQuestion,
  heuristicDetectInterviewQuestion,
  buildClassifierPrompt,
  buildInterviewClassifierPrompt,
  parseClassifierResponse,
  buildSuggestionPrompt
};
