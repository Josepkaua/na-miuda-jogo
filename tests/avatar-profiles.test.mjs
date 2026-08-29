import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { characterProfiles, getCharacterProfile } from "../lib/character-profiles.js";

const root = new URL("../", import.meta.url);

function readThreeByteInteger(buffer, offset) {
  return buffer[offset] | buffer[offset + 1] << 8 | buffer[offset + 2] << 16;
}

test("ships eight unique local character portraits", async () => {
  assert.equal(characterProfiles.length, 8);
  assert.equal(new Set(characterProfiles.map((profile) => profile.id)).size, 8);
  assert.equal(new Set(characterProfiles.map((profile) => profile.src)).size, 8);

  for (const profile of characterProfiles) {
    const asset = await fs.readFile(new URL(`public${profile.src}`, root));
    assert.equal(asset.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(asset.subarray(8, 12).toString("ascii"), "WEBP");
    assert.ok(asset.length > 25_000, `${profile.id} portrait is unexpectedly small`);
    const extendedHeader = asset.indexOf(Buffer.from("VP8X"));
    assert.ok(extendedHeader >= 12, `${profile.id} portrait has no VP8X header`);
    assert.ok(asset[extendedHeader + 8] & 0x10, `${profile.id} portrait has no alpha channel`);
    assert.equal(readThreeByteInteger(asset, extendedHeader + 12) + 1, 512);
    assert.equal(readThreeByteInteger(asset, extendedHeader + 15) + 1, 512);
    assert.equal(getCharacterProfile(`demo:${profile.id}`).id, profile.id);
  }
});

test("keeps the same portrait for the same opaque player id", () => {
  const playerId = "b5423f18-3b21-4b82-b630-91253d117755";
  assert.equal(getCharacterProfile(playerId), getCharacterProfile(playerId));
  assert.notEqual(getCharacterProfile(playerId).src, "");
});

test("an explicit avatar choice overrides the automatic fallback", () => {
  const roster = ["opaque-a", "opaque-b"];
  const marina = characterProfiles.find((profile) => profile.id === "marina");
  assert.equal(getCharacterProfile("opaque-a", roster, "marina"), marina);
  assert.equal(getCharacterProfile("opaque-a", roster, "unknown"), getCharacterProfile("opaque-a", roster));
});

test("assigns the first eight real players different portraits independent of list order", () => {
  const roster = [
    "b5423f18-3b21-4b82-b630-91253d117755",
    "7cdd58df-bf69-482d-a04f-9b8fc2dc8de2",
    "52a5b14e-9149-482c-bab2-7303bf1395ed",
    "35d20a65-c638-49bf-b21c-3d886fc1c7ec",
    "e14d7018-f719-4aa3-a737-c1e13e637043",
    "616dca0e-b215-4d8f-9ad5-dd63412ebdc8",
    "0a30decb-1c25-47dd-88f2-09aa4259dd35",
    "f838d583-5061-46b4-a38f-22ed6d7ff265",
  ];
  const assigned = roster.map((playerId) => getCharacterProfile(playerId, roster).src);
  assert.equal(new Set(assigned).size, 8);
  for (const playerId of roster) {
    assert.equal(getCharacterProfile(playerId, roster), getCharacterProfile(playerId, [...roster].reverse()));
  }
});

test("uses player ids in every avatar surface without profile data leakage", async () => {
  const [page, catalog] = await Promise.all([
    fs.readFile(new URL("app/page.tsx", root), "utf8"),
    fs.readFile(new URL("lib/character-profiles.js", root), "utf8"),
  ]);

  assert.doesNotMatch(page, /<Avatar\s+name=/);
  assert.doesNotMatch(page, /from "next\/image"/);
  assert.match(page, /backgroundImage:\s*`url\("\$\{profile\.src\}"\)`/);
  assert.match(page, /<Avatar playerId=\{player\.id\} name=\{player\.nickname\} avatarId=\{player\.avatarId\} rosterPlayerIds=\{rosterPlayerIds\}/);
  assert.match(page, /<Avatar playerId=\{message\.playerId\} name=\{message\.nickname\} avatarId=\{playersById\.get\(message\.playerId\)\?\.avatarId\} rosterPlayerIds=\{rosterPlayerIds\}/);
  for (const avatar of page.match(/<Avatar\b[^>]*\/>/g) ?? []) {
    assert.match(avatar, /playerId=/);
    assert.match(avatar, /rosterPlayerIds=\{rosterPlayerIds\}/);
  }
  assert.doesNotMatch(catalog, /email|session|avatar_url/i);
  assert.match(page, /p_target_player_id:\s*selectedVote/);
});

test("lets each player choose, persist and share an avatar without database writes", async () => {
  const page = await fs.readFile(new URL("app/page.tsx", root), "utf8");

  assert.match(page, /<fieldset className=\{`avatar-picker/);
  assert.match(page, /<legend>Escolha seu avatar<\/legend>/);
  assert.match(page, /<input type="radio" name=\{name\} value=\{profile\.id\} checked=\{value === profile\.id\}/);
  assert.match(page, /<AvatarPicker name="entry-avatar"/);
  assert.match(page, /<AvatarPicker name="lobby-avatar"/);
  assert.match(page, /localStorage\.getItem\("na-miuda-avatar"\)/);
  assert.match(page, /localStorage\.setItem\("na-miuda-avatar", profile\.id\)/);
  assert.match(page, /mergeAvatarChoices\(normalized, current, selectedAvatarRef\.current, presenceAvatarsRef\.current\)/);
  assert.match(page, /presenceAvatars\.set\(presencePlayerId, choice\.avatarId\)/);
  assert.match(page, /presenceAvatars\.get\(player\.id\) \?\? currentAvatars\.get\(player\.id\)/);
  assert.match(page, /\.channel\(`room-avatar:\$\{roomCode\}`,[\s\S]*presence:\s*\{ key: playerId \}/);
  assert.match(page, /\.on\("presence", \{ event: "sync" \}, syncAvatars\)/);
  assert.match(page, /channel\.presenceState\(\)/);
  assert.match(page, /channel\.track\(\{ player_id: playerId, avatar_id: selectedAvatarRef\.current/);
  assert.match(page, /avatarChannelRef\.current\?\.track\(\{ player_id: me\.id, avatar_id: profile\.id/);
  assert.match(page, /getCharacterProfileById\(presenceAvatarId\)/);
  assert.match(page, /avatarByPlayerId\.set\(presencePlayerId,/);
  assert.match(page, /avatarId: avatarByPlayerId\.get\(player\.id\)\?\.avatarId \?\? player\.avatarId/);
  assert.match(page, /channel\.untrack\(\)/);
  assert.match(page, /supabase\.removeChannel\(channel\)/);
  assert.doesNotMatch(page, /p_avatar_id/);
});

test("keeps the avatar grid responsive and free from internal scrolling", async () => {
  const [globalCss, gameCss] = await Promise.all([
    fs.readFile(new URL("app/globals.css", root), "utf8"),
    fs.readFile(new URL("app/game-ui.css", root), "utf8"),
  ]);
  assert.match(globalCss, /\.avatar-options\s*\{[^}]*display:\s*grid;[^}]*repeat\(4,/);
  assert.match(globalCss, /\.avatar-choice:has\(input:focus-visible\)/);
  assert.match(globalCss, /\.avatar-choice:has\(input:checked\)/);
  assert.doesNotMatch(globalCss.match(/\.avatar-picker\s*\{[^}]*\}/)?.[0] ?? "", /overflow(?:-y)?:\s*(?:auto|scroll)/);
  assert.match(gameCss, /\.lobby-setup-grid\s*\{[^}]*grid-template-columns:\s*minmax/);
  assert.match(gameCss, /@media \(max-width: 760px\)\s*\{\s*\.lobby-setup-grid\s*\{[^}]*grid-template-columns:\s*1fr/);
  const stabilityCss = await fs.readFile(new URL("app/layout-stability.css", root), "utf8");
  assert.match(stabilityCss, /@media \(max-width: 1050px\) and \(min-width: 901px\)[\s\S]*\.game-grid\.phase-lobby[\s\S]*height:\s*auto[\s\S]*\.lobby-setup-grid[\s\S]*grid-template-columns:\s*1fr/);
});
