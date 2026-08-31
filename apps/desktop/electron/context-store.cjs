// User profiles and team-memory (JSON in userData)
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { app } = require("electron");

const SEED_PROFILES = [
  {
    name: "Gerente de projeto",
    role: "Gerente de Projeto",
    team: "",
    responsibilities:
      "Planejamento, priorização, remoção de impedimentos, comunicação com stakeholders.",
    communicationStyle: "Objetivo, foco em riscos, prazos e entregas.",
    basePrompt:
      "Atue como gerente de projeto experiente em times de desenvolvimento ágil."
  },
  {
    name: "Desenvolvedor",
    role: "Desenvolvedor",
    team: "",
    responsibilities:
      "Implementação, code review, estimativas técnicas, qualidade e débito técnico.",
    communicationStyle: "Técnico, direto, com foco em solução e trade-offs.",
    basePrompt:
      "Atue como desenvolvedor sênior participando de dailies e reviews técnicas."
  }
];

function createContextStore(options) {
  const logger = options.logger;
  const baseDir = path.join(app.getPath("userData"), "contexts");
  const profilesPath = path.join(baseDir, "profiles.json");
  const teamMemoryPath = path.join(baseDir, "team-memory.json");

  function ensure() {
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }
    if (!fs.existsSync(profilesPath)) {
      const now = new Date().toISOString();
      const seeds = SEED_PROFILES.map((p) => ({
        id: randomUUID(),
        ...p,
        createdAtIso: now,
        updatedAtIso: now
      }));
      fs.writeFileSync(profilesPath, JSON.stringify({ profiles: seeds }, null, 2), "utf-8");
    }
    if (!fs.existsSync(teamMemoryPath)) {
      fs.writeFileSync(teamMemoryPath, JSON.stringify({ items: [] }, null, 2), "utf-8");
    }
  }

  function listProfiles() {
    ensure();
    const raw = JSON.parse(fs.readFileSync(profilesPath, "utf-8"));
    return raw.profiles || [];
  }

  function saveProfile(profile) {
    ensure();
    const profiles = listProfiles();
    const now = new Date().toISOString();
    const idx = profiles.findIndex((p) => p.id === profile.id);
    const next = {
      id: profile.id || randomUUID(),
      name: profile.name,
      role: profile.role,
      team: profile.team || "",
      responsibilities: profile.responsibilities || "",
      communicationStyle: profile.communicationStyle || "",
      basePrompt: profile.basePrompt || "",
      createdAtIso: profile.createdAtIso || now,
      updatedAtIso: now
    };
    if (idx >= 0) {
      profiles[idx] = { ...profiles[idx], ...next, createdAtIso: profiles[idx].createdAtIso };
    } else {
      profiles.push(next);
    }
    fs.writeFileSync(profilesPath, JSON.stringify({ profiles }, null, 2), "utf-8");
    logger.info("Context profile saved", { id: next.id, name: next.name });
    return profiles;
  }

  function getProfile(profileId) {
    return listProfiles().find((p) => p.id === profileId) || null;
  }

  function appendTeamMemory(entry) {
    ensure();
    const raw = JSON.parse(fs.readFileSync(teamMemoryPath, "utf-8"));
    const items = raw.items || [];
    items.push({
      id: randomUUID(),
      createdAtIso: new Date().toISOString(),
      ...entry
    });
    fs.writeFileSync(teamMemoryPath, JSON.stringify({ items }, null, 2), "utf-8");
  }

  function listTeamMemory() {
    ensure();
    const raw = JSON.parse(fs.readFileSync(teamMemoryPath, "utf-8"));
    return raw.items || [];
  }

  function deleteTeamMemoryItem(itemId) {
    ensure();
    const raw = JSON.parse(fs.readFileSync(teamMemoryPath, "utf-8"));
    const items = (raw.items || []).filter((i) => i.id !== itemId);
    fs.writeFileSync(teamMemoryPath, JSON.stringify({ items }, null, 2), "utf-8");
    return items;
  }

  function updateTeamMemoryItem(itemId, patch) {
    ensure();
    const raw = JSON.parse(fs.readFileSync(teamMemoryPath, "utf-8"));
    const items = raw.items || [];
    const idx = items.findIndex((i) => i.id === itemId);
    if (idx < 0) {
      return null;
    }
    items[idx] = {
      ...items[idx],
      ...patch,
      id: items[idx].id,
      createdAtIso: items[idx].createdAtIso,
      updatedAtIso: new Date().toISOString()
    };
    fs.writeFileSync(teamMemoryPath, JSON.stringify({ items }, null, 2), "utf-8");
    return items[idx];
  }

  function deleteProfile(profileId) {
    ensure();
    const profiles = listProfiles().filter((p) => p.id !== profileId);
    if (!profiles.length) {
      throw new Error("Nao e possivel remover o unico perfil.");
    }
    fs.writeFileSync(profilesPath, JSON.stringify({ profiles }, null, 2), "utf-8");
    logger.info("Context profile deleted", { profileId });
    return profiles;
  }

  function duplicateProfile(profileId) {
    const source = getProfile(profileId);
    if (!source) {
      throw new Error("Perfil nao encontrado.");
    }
    const now = new Date().toISOString();
    const copy = {
      ...source,
      id: randomUUID(),
      name: `${source.name} (copia)`,
      createdAtIso: now,
      updatedAtIso: now
    };
    return saveProfile(copy);
  }

  return {
    listProfiles,
    saveProfile,
    getProfile,
    deleteProfile,
    duplicateProfile,
    appendTeamMemory,
    listTeamMemory,
    updateTeamMemoryItem,
    deleteTeamMemoryItem
  };
}

module.exports = { createContextStore };
