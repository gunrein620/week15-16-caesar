import type { MetadataRoute } from "next";

// 웹 앱 매니페스트 — 홈 화면 설치 시 standalone 앱으로 뜨도록 한다.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "정글마켓 — 우리 동네 중고 마켓",
    short_name: "정글마켓",
    description: "우리 동네에서 바로 거래하는 중고 마켓. 근처 물건을 보고 채팅으로 바로 약속해요.",
    start_url: "/",
    display: "standalone",
    background_color: "#090b0c",
    theme_color: "#090b0c",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
