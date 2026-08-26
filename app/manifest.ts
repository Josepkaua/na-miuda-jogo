import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Na Miúda! — Jogo do Impostor",
    short_name: "Na Miúda!",
    description: "Jogo brasileiro de dedução social com salas privadas, chat e votação para jogar com os amigos à distância.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#060817",
    theme_color: "#060817",
    categories: ["games", "entertainment", "social"],
    lang: "pt-BR",
    icons: [
      {
        src: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/mascote-na-miuda.png",
        sizes: "any",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
