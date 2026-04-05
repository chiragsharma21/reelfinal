import { NextRequest, NextResponse } from "next/server";
 
export const runtime = "edge";
 
const IG_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "*/*",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  Referer: "https://www.instagram.com/",
  Origin: "https://www.instagram.com",
  "X-IG-App-ID": "936619743392459",
};
 
function extractShortcode(url: string): string | null {
  const m = url.match(/(?:reel|p|tv)\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}
 
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const postUrl = searchParams.get("url");
 
  if (!postUrl) {
    return NextResponse.json({ error: "No URL provided" }, { status: 400 });
  }
 
  const shortcode = extractShortcode(postUrl);
  if (!shortcode) {
    return NextResponse.json({ error: "Invalid Instagram URL" }, { status: 400 });
  }
 
  try {
    // Method 1: Instagram oEmbed (no auth needed, public posts only)
    const oembedUrl = `https://www.instagram.com/api/v1/oembed/?url=${encodeURIComponent(postUrl)}&hidecaption=false&maxwidth=500&cb=1`;
 
    // Method 2: Instagram media info via GraphQL
    const graphqlUrl = `https://www.instagram.com/graphql/query/?query_hash=2b0673e0dc4580674a88d426fe00ea90&variables=${encodeURIComponent(
      JSON.stringify({ shortcode })
    )}`;
 
    // Method 3: Direct media endpoint
    const mediaUrl = `https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`;
 
    // Try Method 3 first (most reliable)
    let videoUrl: string | null = null;
    let thumbnail: string | null = null;
 
    try {
      const res = await fetch(mediaUrl, {
        headers: {
          ...IG_HEADERS,
          "X-Requested-With": "XMLHttpRequest",
        },
      });
 
      if (res.ok) {
        const text = await res.text();
        // parse the JSON safely
        const data = JSON.parse(text);
        const item =
          data?.items?.[0] ||
          data?.graphql?.shortcode_media ||
          data?.data?.shortcode_media;
 
        if (item) {
          videoUrl =
            item?.video_versions?.[0]?.url ||
            item?.video_url ||
            item?.clips_metadata?.original_sound_info?.progressive_download_url;
          thumbnail =
            item?.image_versions2?.candidates?.[0]?.url ||
            item?.display_url;
        }
      }
    } catch (_) {}
 
    // Try Method 2 (GraphQL)
    if (!videoUrl) {
      try {
        const res = await fetch(graphqlUrl, { headers: IG_HEADERS });
        if (res.ok) {
          const data = await res.json();
          const media = data?.data?.shortcode_media;
          if (media?.is_video) {
            videoUrl = media.video_url;
            thumbnail = media.display_url;
          }
        }
      } catch (_) {}
    }
 
    // Try Method 4: scrape the page HTML for video URL
    if (!videoUrl) {
      try {
        const pageRes = await fetch(`https://www.instagram.com/reel/${shortcode}/`, {
          headers: {
            ...IG_HEADERS,
            Accept: "text/html,application/xhtml+xml",
          },
        });
 
        if (pageRes.ok) {
          const html = await pageRes.text();
 
          // Look for video URL in page source
          const videoMatch =
            html.match(/"video_url":"([^"]+)"/) ||
            html.match(/"contentUrl":"([^"]+)"/) ||
            html.match(/property="og:video"\s+content="([^"]+)"/);
 
          if (videoMatch) {
            videoUrl = videoMatch[1].replace(/\\u0026/g, "&").replace(/\\/g, "");
          }
 
          // thumbnail
          const thumbMatch = html.match(/property="og:image"\s+content="([^"]+)"/);
          if (thumbMatch) {
            thumbnail = thumbMatch[1];
          }
        }
      } catch (_) {}
    }
 
    if (!videoUrl) {
      return NextResponse.json(
        {
          error:
            "Could not extract video URL. The reel may be private or Instagram blocked the request.",
        },
        { status: 422 }
      );
    }
 
    return NextResponse.json({
      success: true,
      shortcode,
      videoUrl,
      thumbnail,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
