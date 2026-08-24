import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./discussion-refinement.css";
import "./cinematic-transitions.css";
import "./game-polish.css";
import "./automatic-flow.css";
import "./connection-status.css";
import GamePhaseGuard from "./game-phase-guard";
import GameMotionController from "./game-motion-controller";
import GameAutoFlow from "./game-auto-flow";
import ConnectionStatus from "./connection-status";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://na-miuda-jogo.onrender.com"),
  title: "Na Miúda! — Jogo do Impostor",
  description:
    "Crie uma sala, converse pelo chat integrado e descubra quem está improvisando. Um jogo de dedução social brasileiro para jogar à distância.",
  icons: {
    icon: "/mascote-na-miuda.png",
    shortcut: "/mascote-na-miuda.png",
  },
  openGraph: {
    title: "Na Miúda! — Todo mundo sabe. Menos um.",
    description:
      "O jogo do impostor online com chat integrado para jogar com os amigos, onde cada um estiver.",
    type: "website",
    locale: "pt_BR",
    images: [
      {
        url: "/og.png",
        width: 1536,
        height: 1024,
        alt: "Na Miúda! — Todo mundo sabe. Menos um.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Na Miúda! — Todo mundo sabe. Menos um.",
    description:
      "O jogo do impostor online com chat integrado para jogar com os amigos, onde cada um estiver.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>
        {children}
        <ConnectionStatus />
        <GameAutoFlow />
        <GameMotionController />
        <GamePhaseGuard />
      </body>
    </html>
  );
}
