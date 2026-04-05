import { NextRequest, NextResponse } from "next/server";
 
export const runtime = "edge";
 
/**
 * GET /api/reel?url=<instagram_reel_url>
 *
 * Uses RapidAPI: instagram-downloader-download-instagram-stories-videos4
 * Add RAPIDAPI_KEY to Vercel → Settings → Environment Variables
 */
 
const RAPIDAPI_KEY  = process.env.RAPIDAPI_KEY ?? "";
const RAPIDAPI_HOST = "instagram-downloader-download-instagram-stories-videos4.p.rapidapi.com";
 
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const postUrl = searchParams.get("url")?.trim();
 
  if (!postUrl) {
    return NextResponse.json({ error: "No URL provided" }, { status: 400 });
  }
 
  if (!RAPIDAPI_KEY) {
    return NextResponse.json(
      { error: "RAPIDAPI_KEY not set in Vercel environment variables." },
      { status: 500 }
    );
  }
 
  try {
    const apiUrl = `https://${RAPIDAPI_HOST}/convert?url=${encodeURIComponent(postUrl)}`;
 
    const res = await fetch(apiUrl, {
      method: "GET",
      headers: {
        "Content-Type":    "application/json",
        "x-rapidapi-host": RAPIDAPI_HOST,
        "x-rapidapi-key":  RAPIDAPI_KEY,
      },
    });
 
    if (!res.ok) {
      const txt = await res.text();
      return NextResponse.json(
        { error: `RapidAPI error ${res.status}: ${txt.slice(0, 200)}` },
        { status: res.status }
      );
    }
 
    const data = await res.json();
 
    // Response has video/media URL — extract it
    // Common shapes: { url }, { media }, { video_url }, { download_url }, { result: { url } }
    const mediaUrl =
      data?.url ||
      data?.media ||
      data?.video_url ||
      data?.download_url ||
      data?.result?.url ||
      data?.data?.url ||
      data?.data?.download_url ||
      data?.items?.[0]?.url ||
      data?.links?.[0]?.link;
 
    if (!mediaUrl) {
      return NextResponse.json(
        { error: "No media URL in response. Raw: " + JSON.stringify(data).slice(0, 200) },
        { status: 422 }
      );
    }
 
    return NextResponse.json({ success: true, videoUrl: mediaUrl });
 
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
