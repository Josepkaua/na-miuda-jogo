export const characterProfiles = Object.freeze([
  { id: "nina", name: "Nina", src: "/avatars/nina.webp", accent: "#8b5cf6" },
  { id: "bia", name: "Bia", src: "/avatars/bia.webp", accent: "#ff4d6d" },
  { id: "lucas", name: "Lucas", src: "/avatars/lucas.webp", accent: "#00d4ff" },
  { id: "ana", name: "Ana", src: "/avatars/ana.webp", accent: "#00e676" },
  { id: "joao", name: "João", src: "/avatars/joao.webp", accent: "#ffb800" },
  { id: "pedro", name: "Pedro", src: "/avatars/pedro.webp", accent: "#65d46e" },
  { id: "marina", name: "Marina", src: "/avatars/marina.webp", accent: "#ff6b6b" },
  { id: "rafa", name: "Rafa", src: "/avatars/rafa.webp", accent: "#ffd166" },
]);

export function hashCharacterSeed(value) {
  const seed = String(value || "guest");
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function getCharacterProfileById(avatarId) {
  const normalizedId = String(avatarId || "").toLowerCase();
  return characterProfiles.find((profile) => profile.id === normalizedId) ?? null;
}

export function getCharacterProfile(playerId, rosterPlayerIds = [], avatarId = "") {
  const selectedProfile = getCharacterProfileById(avatarId);
  if (selectedProfile) return selectedProfile;

  const seed = String(playerId || "guest").toLowerCase();
  const demoId = seed.startsWith("demo:") ? seed.slice(5) : "";
  const demoProfile = demoId && characterProfiles.find((profile) => profile.id === demoId);
  if (demoProfile) return demoProfile;

  const roster = [...new Set(rosterPlayerIds.map((id) => String(id || "").toLowerCase()).filter(Boolean))];
  if (roster.includes(seed)) {
    roster.sort((left, right) => hashCharacterSeed(left) - hashCharacterSeed(right) || left.localeCompare(right));
    const assignments = new Map();
    const usedProfiles = new Set();
    for (const rosterId of roster) {
      const preferred = hashCharacterSeed(rosterId) % characterProfiles.length;
      let selected = preferred;
      if (usedProfiles.size < characterProfiles.length) {
        for (let step = 0; step < characterProfiles.length; step += 1) {
          const candidate = (preferred + step) % characterProfiles.length;
          if (!usedProfiles.has(candidate)) {
            selected = candidate;
            break;
          }
        }
        usedProfiles.add(selected);
      }
      assignments.set(rosterId, selected);
    }
    return characterProfiles[assignments.get(seed)];
  }

  return characterProfiles[hashCharacterSeed(seed) % characterProfiles.length];
}
