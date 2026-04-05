import { NextRequest, NextResponse } from "next/server";
 
export const runtime = "edge";
 
/**
 * GET /api/reel?url=<instagram_reel_url>
 *
 * Uses RapidAPI "Social Media Video Downloader" — free 500 req/month.
 * Sign up: https://rapidapi.com/ugoBOT/api/social-media-video-downloader
 * Set RAPIDAPI_KEY in Vercel → Settings → Environment Variables.
 */
 
const RAPIDAPI_KEY  = process.env.RAPIDAPI_KEY ?? "";
const RAPIDAPI_HOST = "social-media-video-downloader.p.rapidapi.com";
 
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const postUrl = searchParams.get("url")?.trim();
 
  if (!postUrl)       return NextResponse.json({ error: "No URL provided" }, { status: 400 });
  if (!RAPIDAPI_KEY)  return NextResponse.json({ error: "RAPIDAPI_KEY not configured on server." }, { status: 500 });
 
  try {
    const apiUrl = `https://${RAPIDAPI_HOST}/smvd/get/all?url=${encodeURIComponent(postUrl)}`;
 
    const res = await fetch(apiUrl, {
      headers: {
        "x-rapidapi-key":  RAPIDAPI_KEY,
        "x-rapidapi-host": RAPIDAPI_HOST,
      },
    });
 
    if (!res.ok) {
      const txt = await res.text();
      return NextResponse.json({ error: `RapidAPI ${res.status}: ${txt.slice(0, 200)}` }, { status: res.status });
    }
 
    const data = await res.json();
 
    // shape: { success, title, links: [{ quality, link }] }
    if (!data?.success || !data?.links?.length) {
      return NextResponse.json(
        { error: "No media found. Reel may be private or URL is wrong." },
        { status: 422 }
      );
    }
 
    const links: { quality: string; link: string }[] = data.links;
 
    // prefer audio-only link; fallback to first available
    const audioLink = links.find(l =>
      ["audio","mp3","m4a"].some(k => l.quality?.toLowerCase().includes(k))
    );
    const best = audioLink ?? links[0];
 
    return NextResponse.json({
      success:  true,
      videoUrl: best.link,
      quality:  best.quality,
      title:    data.title ?? "",
    });
 
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
