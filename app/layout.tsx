export const metadata = { title: "Reel → Hinglish", description: "Instagram reel to Hinglish script automation" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#080809" }}>{children}</body>
    </html>
  );
}
