const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  heuristicDetectDirectedQuestion,
  heuristicDetectInterviewQuestion,
  parseClassifierResponse
} = require("./meeting-active-detector.cjs");

test("heuristic detects directed question with user alias", () => {
  const transcript =
    "Time discutiu o roadmap. Joao, o que voce acha do prazo? Precisamos decidir.";
  const result = heuristicDetectDirectedQuestion(transcript, ["Joao"]);
  assert.equal(result.directed, true);
  assert.ok(result.confidence >= 0.55);
  assert.match(result.questionText.toLowerCase(), /joao/);
});

test("heuristic ignores unrelated lines without you or alias", () => {
  const transcript = "O time alinhou metricas. Seguimos para o proximo topico.";
  const result = heuristicDetectDirectedQuestion(transcript, ["Maria"]);
  assert.equal(result.directed, false);
});

test("parseClassifierResponse accepts JSON block", () => {
  const raw = '```\n{"directedToUser":true,"questionText":"Maria, pode falar?","confidence":0.9}\n```';
  const parsed = parseClassifierResponse(raw);
  assert.equal(parsed.directed, true);
  assert.equal(parsed.questionText, "Maria, pode falar?");
  assert.equal(parsed.source, "llm");
});

test("heuristic detects interview technical question without alias", () => {
  const transcript =
    "Vamos começar. Como voce explicaria a diferenca entre processo e thread? Fale sobre trade-offs.";
  const result = heuristicDetectInterviewQuestion(transcript);
  assert.equal(result.directed, true);
  assert.ok(result.confidence >= 0.55);
  assert.match(result.questionText.toLowerCase(), /processo|thread|trade/);
});
