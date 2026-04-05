"use client";
import { useState, useRef, useEffect } from "react";

const HINDI_MAP: Record<string, string> = {
  "और":"aur","है":"hai","हैं":"hain","का":"ka","की":"ki","के":"ke","में":"mein","से":"se","को":"ko","पर":"par",
  "यह":"yeh","वह":"woh","हम":"hum","तुम":"tum","आप":"aap","मैं":"main","नहीं":"nahi","हाँ":"haan",
  "अच्छा":"accha","बहुत":"bahut","तो":"toh","लेकिन":"lekin","अगर":"agar","जब":"jab","क्या":"kya",
  "कैसे":"kaise","कब":"kab","कहाँ":"kahan","क्यों":"kyun","जो":"jo","जैसे":"jaise","भी":"bhi","ही":"hi",
  "तक":"tak","बस":"bas","फिर":"phir","अब":"ab","कभी":"kabhi","सब":"sab","कुछ":"kuch","लोग":"log",
  "दिन":"din","समय":"samay","काम":"kaam","जीवन":"jeevan","दिल":"dil","प्यार":"pyaar","खुशी":"khushi",
  "पैसा":"paisa","घर":"ghar","परिवार":"parivaar","दोस्त":"dost","था":"tha","थी":"thi","थे":"the",
  "हो":"ho","कर":"kar","रहा":"raha","रही":"rahi","रहे":"rahe","गया":"gaya","गई":"gayi","इस":"is",
  "उस":"us","एक":"ek","दो":"do","तीन":"teen","चार":"char","पांच":"paanch","बड़ा":"bada","छोटा":"chhota",
  "अच्छी":"acchi","बुरा":"bura","नया":"naya","पुराना":"purana","सही":"sahi","गलत":"galat","हर":"har",
  "कोई":"koi","किसी":"kisi","साथ":"saath","बाद":"baad","पहले":"pehle","अभी":"abhi","जल्दी":"jaldi",
  "धीरे":"dheere","खुद":"khud","मतलब":"matlab","यानी":"yaani","वैसे":"waise","इसलिए":"isliye",
  "क्योंकि":"kyunki","जरूरी":"zaroori","शायद":"shayad","हमेशा":"hamesha","आजकल":"aajkal",
  "दुनिया":"duniya","जिंदगी":"zindagi","सपना":"sapna","रास्ता":"raasta","मुश्किल":"mushkil",
  "आसान":"aasaan","कोशिश":"koshish","सफलता":"safalta","वक्त":"waqt","शुरू":"shuru","खत्म":"khatam",
  "दरअसल":"darasal","आखिर":"aakhir","चाहिए":"chahiye","होगा":"hoga","करेगा":"karega",
};

function basicHinglish(text: string) {
  let out = text;
  for (const [hi, ro] of Object.entries(HINDI_MAP)) out = out.replaceAll(hi, ro);
  return out.replace(/\s+/g, " ").trim();
}

type Step = "idle" | "fetching" | "downloading" | "transcribing" | "converting" | "done" | "error";

interface Result {
  audioBlob: Blob;
  audioUrl: string;
  transcript: string;
  hinglish: string;
  language: string;
}

export default function Home() {
  const [groqKey, setGroqKey] = useState("");
  const [keyValid, setKeyValid] = useState(false);
  const [url, setUrl] = useState("");
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState<"hinglish" | "transcript" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("groq_key");
    if (saved) { setGroqKey(saved); setKeyValid(saved.startsWith("gsk_") && saved.length > 20); }
  }, []);

  const onKeyChange = (v: string) => {
    setGroqKey(v);
    const valid = v.startsWith("gsk_") && v.length > 20;
    setKeyValid(valid);
    if (valid) localStorage.setItem("groq_key", v);
  };

  const steps: { key: Step; label: string; sub: string }[] = [
    { key: "fetching",     label: "Fetching reel info",       sub: "server-side · bypasses instagram blocks" },
    { key: "downloading",  label: "Downloading audio",         sub: "streaming from instagram cdn" },
    { key: "transcribing", label: "Transcribing",              sub: "whisper-large-v3 via groq" },
    { key: "converting",   label: "Converting to Hinglish",    sub: "llama-3.3-70b via groq" },
  ];
  const stepOrder: Step[] = ["fetching", "downloading", "transcribing", "converting", "done"];

  const stepState = (s: Step): "done" | "active" | "idle" => {
    const cur = stepOrder.indexOf(step);
    const idx = stepOrder.indexOf(s);
    if (cur === -1 || idx === -1) return "idle";
    if (idx < cur) return "done";
    if (idx === cur) return "active";
    return "idle";
  };

  async function process(audioBlob?: Blob) {
    if (!keyValid) { alert("Enter your Groq API key first."); return; }
    if (!audioBlob && !url.includes("instagram.com")) { alert("Paste a valid Instagram reel URL."); return; }

    setError(""); setResult(null);

    let blob: Blob | undefined = audioBlob;

    if (!blob) {
      // Step 1: get video URL from our own API
      setStep("fetching");
      const apiRes = await fetch(`/api/reel?url=${encodeURIComponent(url)}`);
      const apiData = await apiRes.json();
      if (!apiRes.ok || !apiData.videoUrl) {
        setStep("error");
        setError(apiData.error || "Could not fetch reel. It may be private.");
        return;
      }

      // Step 2: download the video/audio
      setStep("downloading");
      try {
        const vidRes = await fetch(apiData.videoUrl);
        if (!vidRes.ok) throw new Error("Failed to download from Instagram CDN");
        blob = await vidRes.blob();
      } catch (e: any) {
        setStep("error");
        setError("CDN download failed: " + e.message);
        return;
      }
    }

    // Step 3: transcribe
    setStep("transcribing");
    const form = new FormData();
    form.append("file", blob, "audio.mp4");
    form.append("model", "whisper-large-v3");
    form.append("response_format", "verbose_json");

    const whisperRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${groqKey}` },
      body: form,
    });

    if (!whisperRes.ok) {
      const err = await whisperRes.json().catch(() => ({}));
      setStep("error");
      setError("Groq Whisper error: " + (err?.error?.message || whisperRes.status));
      return;
    }

    const whisperData = await whisperRes.json();
    const transcript = whisperData.text?.trim() || "";
    const language = whisperData.language || "unknown";

    // Step 4: Hinglish via LLaMA
    setStep("converting");
    let hinglish = "";

    try {
      const llmRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          temperature: 0.3,
          max_tokens: 2048,
          messages: [{
            role: "user",
            content: `Convert this transcript to natural Hinglish (Hindi words in Roman script + English mix, exactly how young Indians speak and text).

Rules:
- Only Roman script, zero Devanagari
- Keep common English words as-is (actually, literally, vibe, mindset etc.)
- Phonetically romanize Hindi words (aur, lekin, matlab etc.)
- Keep the original emotion and meaning
- Output ONLY the converted text, nothing else

Transcript:
${transcript}`,
          }],
        }),
      });

      if (llmRes.ok) {
        const llmData = await llmRes.json();
        hinglish = llmData.choices?.[0]?.message?.content?.trim() || basicHinglish(transcript);
      } else {
        hinglish = basicHinglish(transcript);
      }
    } catch {
      hinglish = basicHinglish(transcript);
    }

    setResult({
      audioBlob: blob,
      audioUrl: URL.createObjectURL(blob),
      transcript,
      hinglish,
      language,
    });
    setStep("done");
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await process(file);
  }

  async function copy(which: "hinglish" | "transcript") {
    const text = which === "hinglish" ? result?.hinglish : result?.transcript;
    if (text) await navigator.clipboard.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(null), 1800);
  }

  function downloadTxt(text: string, filename: string) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    a.download = filename;
    a.click();
  }

  function reset() {
    setStep("idle"); setError(""); setResult(null); setUrl("");
    if (fileRef.current) fileRef.current.value = "";
  }

  const isProcessing = ["fetching","downloading","transcribing","converting"].includes(step);

  return (
    <main style={{minHeight:"100vh",background:"#080809",color:"#ededf0",fontFamily:"'Manrope',sans-serif",display:"flex",flexDirection:"column",alignItems:"center",padding:"0 1rem 5rem"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Mono:wght@400;500&family=Manrope:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        body{background:#080809}
        ::placeholder{color:#3a3a50}
        input{outline:none}
        audio{width:100%;accent-color:#c8f135}
        audio::-webkit-media-controls-panel{background:#111115}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-thumb{background:#2a2a38;border-radius:2px}
        body::before{content:'';position:fixed;inset:0;z-index:0;pointer-events:none;
          background-image:linear-gradient(rgba(255,255,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.03) 1px,transparent 1px);
          background-size:48px 48px;}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadein{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        .fadein{animation:fadein 0.4s ease both}
      `}</style>

      <div style={{width:"100%",maxWidth:680,position:"relative",zIndex:1}}>

        {/* Header */}
        <header style={{padding:"3rem 0 2rem"}}>
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,letterSpacing:"0.2em",color:"#c8f135",textTransform:"uppercase",marginBottom:"0.9rem",display:"flex",alignItems:"center",gap:8}}>
            <span style={{display:"inline-block",width:20,height:1,background:"#c8f135"}}/>
            Typography Reels · Auto Pipeline
          </div>
          <h1 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"clamp(3.8rem,11vw,7.5rem)",lineHeight:0.9,letterSpacing:"0.02em",marginBottom:"1rem"}}>
            <span style={{color:"#2e2e3e"}}>REEL</span><br/>
            <span style={{color:"#c8f135"}}>HINGLISH</span>
          </h1>
          <p style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#52526a",lineHeight:1.8}}>
            paste instagram link → audio + hinglish script. fully automated.
          </p>
        </header>

        {/* API Key */}
        <div style={{background:"#0f0f12",border:"1px solid #ffffff18",borderRadius:16,padding:"1.25rem 1.5rem",marginBottom:"1rem"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"0.75rem"}}>
            <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,letterSpacing:"0.15em",color:"#c8f135",textTransform:"uppercase"}}>Groq API Key</span>
            <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,padding:"3px 10px",borderRadius:20,
              background: keyValid ? "#0d2a1a" : "#1a1a22",
              color: keyValid ? "#4ade80" : "#52526a"}}>
              {keyValid ? "✓ ready" : "not set"}
            </span>
          </div>
          <input type="password" value={groqKey} onChange={e=>onKeyChange(e.target.value)}
            placeholder="gsk_xxxxxxxxxxxxxxxxxxxxxxxx"
            style={{width:"100%",background:"#080809",border:"1px solid #ffffff18",borderRadius:10,color:"#ededf0",fontFamily:"'DM Mono',monospace",fontSize:13,padding:"0.65rem 1rem",transition:"border-color 0.2s",borderColor:keyValid?"rgba(200,241,53,0.3)":"#ffffff18"}}/>
          <p style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"#52526a",marginTop:"0.6rem",lineHeight:1.6}}>
            Free key from{" "}
            <a href="https://console.groq.com/keys" target="_blank" style={{color:"#c8f135",textDecoration:"none"}}>console.groq.com/keys</a>
            {" "}· saved in browser · never sent anywhere except Groq
          </p>
        </div>

        {/* URL Input */}
        <div style={{background:"#0f0f12",border:"1px solid #ffffff18",borderRadius:16,padding:"1.5rem",marginBottom:"1rem"}}>
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,letterSpacing:"0.15em",color:"#c8f135",textTransform:"uppercase",marginBottom:"0.75rem"}}>Instagram Reel URL</div>
          <div style={{display:"flex",gap:"0.6rem"}}>
            <input type="text" value={url} onChange={e=>setUrl(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&process()}
              placeholder="https://www.instagram.com/reel/..."
              style={{flex:1,background:"#080809",border:"1px solid #ffffff18",borderRadius:10,color:"#ededf0",fontFamily:"'DM Mono',monospace",fontSize:13,padding:"0.65rem 1rem"}}/>
            <button onClick={()=>process()} disabled={isProcessing}
              style={{background:"#c8f135",color:"#0a0a0a",border:"none",borderRadius:10,fontFamily:"Manrope,sans-serif",fontWeight:700,fontSize:14,padding:"0 1.5rem",cursor:isProcessing?"not-allowed":"pointer",opacity:isProcessing?0.4:1,whiteSpace:"nowrap",transition:"opacity 0.2s"}}>
              {isProcessing ? "Processing..." : "Process →"}
            </button>
          </div>
        </div>

        {/* Upload fallback */}
        <div style={{background:"#0f0f12",border:"1px solid #ffffff18",borderRadius:16,padding:"1.25rem 1.5rem",marginBottom:"1rem"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"0.75rem"}}>
            <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,letterSpacing:"0.15em",color:"#c8f135",textTransform:"uppercase"}}>Or Upload Audio</span>
            <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#52526a"}}>skip download · drag mp3/m4a/wav</span>
          </div>
          <label style={{display:"block",cursor:"pointer"}}>
            <div style={{border:"1.5px dashed #ffffff28",borderRadius:10,padding:"1.25rem",textAlign:"center",fontFamily:"'DM Mono',monospace",fontSize:12,color:"#52526a",transition:"all 0.2s"}}
              onDragOver={e=>{e.preventDefault();(e.currentTarget as HTMLDivElement).style.borderColor="#c8f135"}}
              onDragLeave={e=>{(e.currentTarget as HTMLDivElement).style.borderColor="#ffffff28"}}
              onDrop={async e=>{
                e.preventDefault();
                (e.currentTarget as HTMLDivElement).style.borderColor="#ffffff28";
                const file=e.dataTransfer.files[0];
                if(file&&file.type.startsWith("audio/")) await process(file);
              }}>
              drop audio file here · or click to browse
            </div>
            <input ref={fileRef} type="file" accept="audio/*" style={{display:"none"}} onChange={onUpload}/>
          </label>
        </div>

        {/* Progress */}
        {isProcessing && (
          <div className="fadein" style={{background:"#0f0f12",border:"1px solid #ffffff18",borderRadius:16,padding:"1.5rem",marginBottom:"1rem"}}>
            {steps.map(s=>{
              const state = stepState(s.key);
              return (
                <div key={s.key} style={{display:"flex",alignItems:"flex-start",gap:"1rem",padding:"0.6rem 0",borderBottom:"1px solid #ffffff0d",opacity:state==="idle"?0.28:1,transition:"opacity 0.4s"}}>
                  <div style={{width:30,height:30,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
                    background: state==="done"?"#4ade80":"transparent",
                    border: state==="done"?"none": state==="active"?"1px solid #c8f135":"1px solid #ffffff28",
                    color: state==="done"?"#000": state==="active"?"#c8f135":"#52526a",
                    fontSize: state==="active"?0:12, fontFamily:"'DM Mono',monospace"}}>
                    {state==="done" ? "✓" : state==="active" ? (
                      <div style={{width:12,height:12,borderRadius:"50%",border:"2px solid #c8f135",borderTopColor:"transparent",animation:"spin 0.8s linear infinite"}}/>
                    ) : steps.indexOf(s)+1}
                  </div>
                  <div>
                    <div style={{fontSize:14,fontWeight:600,marginBottom:2}}>{s.label}</div>
                    <div style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"#52526a"}}>{s.sub}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Error */}
        {step==="error" && (
          <div className="fadein" style={{background:"#120808",border:"1px solid #3a1010",borderRadius:16,padding:"1.5rem",marginBottom:"1rem"}}>
            <div style={{color:"#ff5757",fontWeight:700,marginBottom:"0.5rem"}}>Something went wrong</div>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#994444",lineHeight:1.7}}>{error}</div>
            <button onClick={reset} style={{marginTop:"1rem",fontFamily:"'DM Mono',monospace",fontSize:12,background:"none",border:"1px solid #3a1010",borderRadius:8,color:"#994444",padding:"0.4rem 1rem",cursor:"pointer"}}>← try again</button>
          </div>
        )}

        {/* Results */}
        {step==="done" && result && (
          <div className="fadein">
            {/* Audio */}
            <div style={{background:"#0f0f12",border:"1px solid #ffffff18",borderRadius:16,padding:"1.5rem",marginBottom:"1rem"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"0.9rem"}}>
                <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,letterSpacing:"0.15em",color:"#c8f135",textTransform:"uppercase"}}>Audio</span>
                <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,background:"#161619",border:"1px solid #ffffff28",borderRadius:6,padding:"2px 8px",color:"#52526a"}}>detected: {result.language}</span>
              </div>
              <div style={{background:"#080809",border:"1px solid #ffffff18",borderRadius:10,padding:"0.75rem"}}>
                <audio controls src={result.audioUrl}/>
              </div>
              <div style={{display:"flex",gap:"0.6rem",marginTop:"0.75rem"}}>
                <a href={result.audioUrl} download="reel_audio.mp4"
                  style={{display:"inline-flex",alignItems:"center",gap:6,background:"#c8f135",border:"none",borderRadius:8,color:"#0a0a0a",fontFamily:"'DM Mono',monospace",fontSize:12,padding:"0.5rem 1rem",fontWeight:700,textDecoration:"none",cursor:"pointer"}}>
                  ⬇ Download Audio
                </a>
              </div>
            </div>

            {/* Hinglish */}
            <div style={{background:"#0f0f12",border:"1px solid #ffffff18",borderRadius:16,padding:"1.5rem",marginBottom:"1rem"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"0.75rem"}}>
                <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,letterSpacing:"0.15em",color:"#c8f135",textTransform:"uppercase"}}>✦ Hinglish Script</span>
                <button onClick={()=>copy("hinglish")} style={{fontFamily:"'DM Mono',monospace",fontSize:11,background:"transparent",border:"1px solid #ffffff28",borderRadius:6,color:"#52526a",padding:"4px 10px",cursor:"pointer"}}>
                  {copied==="hinglish"?"copied!":"copy"}
                </button>
              </div>
              <div style={{background:"#080809",border:"1px solid #ffffff18",borderRadius:10,padding:"1rem",fontFamily:"'DM Mono',monospace",fontSize:13,lineHeight:1.8,color:"#ededf0",whiteSpace:"pre-wrap",wordBreak:"break-word",maxHeight:200,overflowY:"auto"}}>
                {result.hinglish}
              </div>
              <button onClick={()=>downloadTxt(result.hinglish,"hinglish_script.txt")}
                style={{marginTop:"0.75rem",display:"inline-flex",alignItems:"center",gap:6,background:"#161619",border:"1px solid #ffffff28",borderRadius:8,color:"#ededf0",fontFamily:"'DM Mono',monospace",fontSize:12,padding:"0.5rem 1rem",cursor:"pointer",textDecoration:"none"}}>
                ⬇ Download .txt
              </button>
            </div>

            {/* Transcript */}
            <div style={{background:"#0f0f12",border:"1px solid #ffffff18",borderRadius:16,padding:"1.5rem",marginBottom:"1rem"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"0.75rem"}}>
                <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,letterSpacing:"0.15em",color:"#52526a",textTransform:"uppercase"}}>Raw Transcript</span>
                <button onClick={()=>copy("transcript")} style={{fontFamily:"'DM Mono',monospace",fontSize:11,background:"transparent",border:"1px solid #ffffff28",borderRadius:6,color:"#52526a",padding:"4px 10px",cursor:"pointer"}}>
                  {copied==="transcript"?"copied!":"copy"}
                </button>
              </div>
              <div style={{background:"#080809",border:"1px solid #ffffff18",borderRadius:10,padding:"1rem",fontFamily:"'DM Mono',monospace",fontSize:13,lineHeight:1.8,color:"#ededf0",whiteSpace:"pre-wrap",wordBreak:"break-word",maxHeight:200,overflowY:"auto"}}>
                {result.transcript}
              </div>
              <button onClick={()=>downloadTxt(result.transcript,"transcript.txt")}
                style={{marginTop:"0.75rem",display:"inline-flex",alignItems:"center",gap:6,background:"#161619",border:"1px solid #ffffff28",borderRadius:8,color:"#ededf0",fontFamily:"'DM Mono',monospace",fontSize:12,padding:"0.5rem 1rem",cursor:"pointer",textDecoration:"none"}}>
                ⬇ Download .txt
              </button>
            </div>

            <div style={{textAlign:"center",paddingTop:"0.5rem"}}>
              <button onClick={reset} style={{fontFamily:"'DM Mono',monospace",fontSize:12,background:"none",border:"none",color:"#52526a",cursor:"pointer"}}>← process another reel</button>
            </div>
          </div>
        )}

        <footer style={{marginTop:"3rem",fontFamily:"'DM Mono',monospace",fontSize:10,color:"#2e2e3e",textAlign:"center",letterSpacing:"0.08em",lineHeight:2}}>
          groq whisper-large-v3 · llama-3.3-70b · vercel edge · all free
        </footer>
      </div>
    </main>
  );
}
