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
  assert.match(page, /<Avatar playerId=\{player\.id\} name=\{player\.nickname\} rosterPlayerIds=\{rosterPlayerIds\}/);
  assert.match(page, /<Avatar playerId=\{message\.playerId\} name=\{message\.nickname\} rosterPlayerIds=\{rosterPlayerIds\}/);
  for (const avatar of page.match(/<Avatar\b[^>]*\/>/g) ?? []) {
    assert.match(avatar, /playerId=/);
    assert.match(avatar, /rosterPlayerIds=\{rosterPlayerIds\}/);
  }
  assert.doesNotMatch(catalog, /email|session|avatar_url/i);
  assert.match(page, /p_target_player_id:\s*selectedVote/);
});
