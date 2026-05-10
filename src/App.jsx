import React, { useState, useRef, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const MODEL = "claude-sonnet-4-6";
const API_KEY = import.meta.env.VITE_ANTHROPIC_KEY || "";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

const STANDARD_LIMIT = 4500;
const HARD_LIMIT = 9000;

const SAMPLE = `Meeting with Sonia Rodriguez — independent R&B artist releasing debut EP "He's Alive."

The song is spiritual R&B about her late grandfather. She wants the video to feel like a beautiful memory — cinematic home video aesthetic. Loves Beyoncé Lemonade and Childish Gambino Redbone. Warm, golden, film-grain.

Locations: grandmother's house in Houston, old Baptist church nearby, open field at golden hour.

Wardrobe: Sonia in white flowy dress. 3 dancers in earth tones — terracotta, dusty sage. Wants it personal, not polished. "I want people to cry."

Key shots: performance at church, her at grandfather's old piano, slow mo laughing and crying, his old Bible with a 1987 receipt inside.

We also discussed a behind-the-scenes EPK mini documentary — 5-7 minutes — capturing the making of the video, interviews about the song's meaning, candid family moments.

Deliverables: 4-minute music video, 60-second Instagram reel, 5-7 minute EPK documentary, 8-10 production stills.
Budget: $6,500. Timeline: 3 weeks shoot, 2 weeks post.`;

const SYSTEM_PROMPT = `You are a creative director AI for a video and photography production company. Analyze meeting notes and return ONLY a valid JSON object — no markdown, no backticks, no explanation, just raw JSON.

Create one concept per deliverable. Generate 3-5 clientActionItems (things the client must do before shoot) and 3-5 internalTodos (internal team tasks).

Return exactly this structure:
{"coverEmoji":"🎬","projectTitle":"","clientName":"","projectType":"","date":"","timeline":"","budget":"","logline":"","overview":"","moodKeywords":[],"moodDescription":"","references":[],"overallLocations":[{"name":"","description":""}],"overallWardrobe":[],"overallProps":[],"generalNotes":"","clientActionItems":[{"id":"ca-1","text":"","done":false}],"internalTodos":[{"id":"it-1","text":"","done":false}],"concepts":[{"id":"concept-1","emoji":"🎥","title":"","type":"","logline":"","description":"","moodKeywords":[],"inspiration":[],"locations":[{"name":"","vibe":"","description":"","shots":""}],"lighting":{"style":"","description":"","technical":""},"colorHex":["#c8a97e","#3d2b1f","#f5ede0"],"colorDescription":"","wardrobe":[],"wardrobeNotes":"","props":[],"shotList":[{"number":"01","type":"","description":"","lens":"","notes":""}],"script":{"hook":"","act1":"","act2":"","act3":"","cta":""},"deliverableFormat":"","directorNotes":""}]}`;

// ─── SAFETY HELPERS ──────────────────────────────────────────────────────────
// arr() always returns an array — prevents "reading 'length' of undefined"
const arr = (x) => Array.isArray(x) ? x : [];
// Safe object access
const obj = (x) => (x && typeof x === "object" && !Array.isArray(x)) ? x : {};

// ─── ERROR BOUNDARY ──────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  componentDidCatch(e, info) { console.error("Frame Brief error:", e, info); }
  render() {
    if (this.state.error) return (
      <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:16, padding:40, fontFamily:"Georgia, serif" }}>
        <div style={{ fontSize:40 }}>⚠️</div>
        <h2 style={{ fontSize:20, fontWeight:700, color:"#37352f" }}>Something went wrong</h2>
        <p style={{ fontSize:14, color:"#9b9a97", maxWidth:400, textAlign:"center", lineHeight:1.7 }}>
          {this.state.error?.message || "An unexpected error occurred."}
        </p>
        <button onClick={() => { localStorage.clear(); this.setState({ error: null }); window.location.reload(); }}
          style={{ background:"#37352f", color:"#fff", border:"none", padding:"10px 24px", borderRadius:6, fontSize:14, cursor:"pointer", fontFamily:"inherit" }}>
          Clear data &amp; reload
        </button>
        <button onClick={() => this.setState({ error: null })}
          style={{ background:"transparent", color:"#9b9a97", border:"1px solid #e8e4dc", padding:"10px 24px", borderRadius:6, fontSize:14, cursor:"pointer", fontFamily:"inherit" }}>
          Try again
        </button>
      </div>
    );
    return this.props.children;
  }
}

const readText = (f) => new Promise((res,rej)=>{const r=new FileReader();r.onload=e=>res(e.target.result);r.onerror=rej;r.readAsText(f);});
const readB64 = (f) => new Promise((res,rej)=>{const r=new FileReader();r.onload=e=>res(e.target.result.split(",")[1]);r.onerror=rej;r.readAsDataURL(f);});
const ACCEPT={"application/pdf":"pdf","text/plain":"txt","application/msword":"doc","application/vnd.openxmlformats-officedocument.wordprocessingml.document":"docx","text/markdown":"md"};
const isURL=(s)=>{try{const u=new URL(s);return u.protocol==="http:"||u.protocol==="https:";}catch{return false;}};
const fmtSize=(b)=>b<1024?`${b}B`:b<1048576?`${(b/1024).toFixed(1)}KB`:`${(b/1048576).toFixed(1)}MB`;
const STATUSES=["Draft","In Progress","Review","Delivered","Archived"];
const SS={"Draft":{bg:"#f1f0ef",c:"#9b9a97"},"In Progress":{bg:"#e8f0fe",c:"#1a56c4"},"Review":{bg:"#fdeee4",c:"#b94a1a"},"Delivered":{bg:"#e6f4ea",c:"#1e7e34"},"Archived":{bg:"#f1f0ef",c:"#c4c3bf"}};
// ─── STATUS BADGE ─────────────────────────────────────────────────────────────
function StatusBadge({status,onChange,readonly}){
  const[open,setOpen]=useState(false);
  const s=SS[status]||SS.Draft;
  if(readonly)return<span style={{background:s.bg,color:s.c,borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:600}}>{status}</span>;
  return(
    <div style={{position:"relative",display:"inline-block"}} onClick={e=>e.stopPropagation()}>
      <span onClick={()=>setOpen(o=>!o)} style={{background:s.bg,color:s.c,borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:600,cursor:"pointer",userSelect:"none"}}>{status} ▾</span>
      {open&&<div style={{position:"absolute",top:"100%",left:0,marginTop:4,background:"#fff",border:"1px solid #f1f0ef",borderRadius:8,boxShadow:"0 4px 16px rgba(0,0,0,0.1)",zIndex:300,minWidth:140,overflow:"hidden"}}>
        {STATUSES.map(st=>{const sc=SS[st];return(<div key={st} onClick={()=>{onChange(st);setOpen(false);}} style={{padding:"8px 14px",cursor:"pointer",display:"flex",alignItems:"center"}} onMouseEnter={e=>e.currentTarget.style.background="#f7f6f3"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}><span style={{background:sc.bg,color:sc.c,borderRadius:20,padding:"2px 8px",fontSize:11,fontWeight:600}}>{st}</span></div>);})}
      </div>}
    </div>
  );
}


// ─── VOICE MIC BUTTON ─────────────────────────────────────────────────────────
function VoiceMicBtn({ onTranscript, targetRef }) {
  const [listening, setListening] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const recognitionRef = useRef(null);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setUnsupported(true); return; }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    let finalSoFar = "";
    rec.onstart = () => setListening(true);
    rec.onend = () => { setListening(false); finalSoFar = ""; };
    rec.onerror = () => setListening(false);
    rec.onresult = (e) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      if (final) {
        finalSoFar += final;
        onTranscript(finalSoFar, interim);
      } else {
        onTranscript(finalSoFar, interim);
      }
    };
    recognitionRef.current = rec;
  }, []);

  function toggle() {
    if (!recognitionRef.current) return;
    if (listening) { recognitionRef.current.stop(); }
    else { recognitionRef.current.start(); }
  }

  if (unsupported) return null;

  return (
    <button onClick={toggle} title={listening ? "Stop recording" : "Speak your notes"}
      style={{ background: listening ? "#c0392b" : "#37352f", color: "#fff", border: "none", borderRadius: 8, padding: "10px 16px", fontSize: 13, cursor: "pointer", fontFamily: "'Lora',serif", display: "flex", alignItems: "center", gap: 8, transition: "all .2s", flexShrink: 0 }}>
      {listening
        ? <><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff", animation: "pulse 1s infinite" }} />Stop</>
        : <><span style={{ fontSize: 16 }}>🎤</span>Speak</>}
    </button>
  );
}

// ─── IDEA CAPTURE SCREEN ──────────────────────────────────────────────────────
const DEFAULT_WORKSPACES = [
  { id: "gh-productions", name: "GH Productions", emoji: "🎬" },
  { id: "all-shades-of-hue", name: "All Shades of Hue", emoji: "🌈" },
  { id: "frame-brief", name: "Frame Brief", emoji: "📋" },
  { id: "personal", name: "Personal", emoji: "💡" },
];
const EMOJIS = ["💡","🎬","🌈","📋","🎯","🚀","🎨","📸","🎵","📝","🔥","⚡","🌟","🏆","💼","🛠","📱","🎤","🎥","🌿"];

const IDEA_SYSTEM = `You are a creative director and content strategist. The user has captured a raw idea. Turn it into a structured creative brief for a content piece or video project.

Return ONLY raw JSON, no markdown, no backticks:
{"title":"","logline":"","format":"","targetAudience":"","hook":"","angle":"","outline":[{"act":"","description":""}],"keyPoints":[],"scriptNotes":"","locations":[{"name":"","notes":""}],"props":[],"shotList":[{"number":"01","type":"","description":""}],"toDoList":[{"text":"","done":false}],"estimatedLength":"","tags":[]}`;

// ─── IDEA PAGE (expanded view) ────────────────────────────────────────────────
function IdeaPage({ idea, onBack, onUpdate }) {
  const [localIdea, setLocalIdea] = useState(idea);
  const brief = localIdea.brief;
  const set = (k, v) => {
    const updated = { ...localIdea, brief: { ...brief, [k]: v } };
    setLocalIdea(updated);
    onUpdate(updated);
  };
  const upArr = (k, i, v) => {
    const a = [...(brief[k] || [])]; a[i] = v;
    const updated = { ...localIdea, brief: { ...brief, [k]: a } };
    setLocalIdea(updated); onUpdate(updated);
  };
  const delArr = (k, i) => {
    const updated = { ...localIdea, brief: { ...brief, [k]: (brief[k] || []).filter((_, j) => j !== i) } };
    setLocalIdea(updated); onUpdate(updated);
  };
  const addArr = (k, item) => {
    const updated = { ...localIdea, brief: { ...brief, [k]: [...(brief[k] || []), item] } };
    setLocalIdea(updated); onUpdate(updated);
  };


  return (
    <div style={{ minHeight: "100vh", background: "#fff", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ borderBottom: "1px solid #f1f0ef", padding: "12px 20px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: "#9b9a97", cursor: "pointer", fontSize: 13, fontFamily: "'Lora',serif", display: "flex", alignItems: "center", gap: 4 }}>← Ideas</button>
        <span style={{ color: "#e8e4dc" }}>·</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#37352f", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{brief?.title || localIdea.rawText?.slice(0, 40)}</span>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", maxWidth: 760, width: "100%", margin: "0 auto", padding: "40px 24px 100px" }}>
        {/* Raw idea */}
        <div style={{ background: "#f7f6f3", borderLeft: "3px solid #e97942", padding: "14px 18px", borderRadius: "0 8px 8px 0", marginBottom: 28, fontSize: 14, color: "#55534e", lineHeight: 1.7, fontStyle: "italic" }}>
          <div style={{ fontSize: 10, fontFamily: "'IBM Plex Mono',monospace", color: "#9b9a97", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Original Idea</div>
          {localIdea.rawText}
        </div>

        {!brief ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#c4c3bf" }}>
            <div className="spin" style={{ width: 24, height: 24, border: "2px solid #f1f0ef", borderTop: "2px solid #37352f", borderRadius: "50%", margin: "0 auto 12px" }} />
            <p style={{ fontSize: 13, fontStyle: "italic" }}>Generating your creative brief…</p>
          </div>
        ) : (
          <>
            {/* Title + logline */}
            <h1 style={{ fontSize: 30, fontWeight: 700, color: "#37352f", letterSpacing: "-0.02em", marginBottom: 6, lineHeight: 1.2 }}>
              <Editable value={brief.title} onChange={v => set("title", v)} placeholder="Untitled Idea" />
            </h1>
            <div style={{ fontSize: 15, color: "#9b9a97", fontStyle: "italic", marginBottom: 8, lineHeight: 1.6 }}>
              <Editable value={brief.logline} onChange={v => set("logline", v)} placeholder="One-sentence pitch…" />
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
              {[["Format", "format"], ["Audience", "targetAudience"], ["Est. Length", "estimatedLength"]].map(([l, k]) => (
                <div key={k} style={{ background: "#f1f0ef", borderRadius: 6, padding: "4px 10px" }}>
                  <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono',monospace", color: "#9b9a97", textTransform: "uppercase", letterSpacing: "0.06em" }}>{l}: </span>
                  <span style={{ fontSize: 12, color: "#37352f", fontWeight: 600 }}><Editable value={brief[k]} onChange={v => set(k, v)} placeholder="—" /></span>
                </div>
              ))}
            </div>

            <HR />
            <Section emoji="🎣" title="Hook & Angle">
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontFamily: "'IBM Plex Mono',monospace", color: "#9b9a97", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Hook</div>
                <div style={{ fontSize: 14, lineHeight: 1.8, background: "#fafaf9", borderRadius: 6, padding: "10px 14px" }}>
                  <Editable value={brief.hook} onChange={v => set("hook", v)} multiline placeholder="What grabs attention in the first 3 seconds?" />
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontFamily: "'IBM Plex Mono',monospace", color: "#9b9a97", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Angle / Perspective</div>
                <div style={{ fontSize: 14, lineHeight: 1.8, background: "#fafaf9", borderRadius: 6, padding: "10px 14px" }}>
                  <Editable value={brief.angle} onChange={v => set("angle", v)} multiline placeholder="What's the unique point of view?" />
                </div>
              </div>
            </Section>
            <HR />

            <Section emoji="📋" title="Content Outline">
              {(brief.outline || []).map((act, i) => (
                <div key={i} style={{ background: "#f9f8f6", borderLeft: "3px solid #e8e4dc", padding: "12px 16px", borderRadius: "0 8px 8px 0", marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontFamily: "'IBM Plex Mono',monospace", color: "#9b9a97", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                    <Editable value={act.act} onChange={v => upArr("outline", i, { ...act, act: v })} placeholder="Section name" />
                  </div>
                  <div style={{ fontSize: 14, lineHeight: 1.75 }}>
                    <Editable value={act.description} onChange={v => upArr("outline", i, { ...act, description: v })} multiline placeholder="Describe this section…" />
                  </div>
                </div>
              ))}
              <button onClick={() => addArr("outline", { act: "New Section", description: "" })} style={{ background: "none", border: "none", color: "#9b9a97", fontSize: 13, cursor: "pointer", fontFamily: "inherit", padding: "4px 0" }}
                onMouseEnter={e => e.currentTarget.style.color = "#37352f"} onMouseLeave={e => e.currentTarget.style.color = "#9b9a97"}>
                + Add section
              </button>
            </Section>
            <HR />

            <Section emoji="💬" title="Key Points to Hit">
              {(brief.keyPoints || []).map((pt, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "5px 0" }}>
                  <span style={{ color: "#e97942", marginTop: 4 }}>→</span>
                  <div style={{ flex: 1, fontSize: 14 }}><Editable value={pt} onChange={v => upArr("keyPoints", i, v)} placeholder="Key point…" /></div>
                  <button onClick={() => delArr("keyPoints", i)} style={{ background: "none", border: "none", color: "#ddd", cursor: "pointer", fontSize: 13 }}
                    onMouseEnter={e => e.currentTarget.style.color = "#c0392b"} onMouseLeave={e => e.currentTarget.style.color = "#ddd"}>✕</button>
                </div>
              ))}
              <button onClick={() => addArr("keyPoints", "New point")} style={{ background: "none", border: "none", color: "#9b9a97", fontSize: 13, cursor: "pointer", fontFamily: "inherit", padding: "4px 0" }}
                onMouseEnter={e => e.currentTarget.style.color = "#37352f"} onMouseLeave={e => e.currentTarget.style.color = "#9b9a97"}>+ Add point</button>
            </Section>
            <HR />

            <Section emoji="📝" title="Script Notes">
              <div style={{ fontSize: 14, lineHeight: 1.85, background: "#fafaf9", borderRadius: 6, padding: "12px 16px" }}>
                <Editable value={brief.scriptNotes} onChange={v => set("scriptNotes", v)} multiline placeholder="Tone, delivery notes, phrases to use or avoid…" />
              </div>
            </Section>
            <HR />

            <Section emoji="📍" title="Locations">
              {(brief.locations || []).map((loc, i) => (
                <div key={i} style={{ background: "#f7f6f3", borderRadius: 8, padding: "12px 14px", marginBottom: 8, border: "1px solid #eeece8" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}><Editable value={loc.name} onChange={v => upArr("locations", i, { ...loc, name: v })} placeholder="Location name" /></div>
                      <div style={{ fontSize: 13, color: "#55534e" }}><Editable value={loc.notes} onChange={v => upArr("locations", i, { ...loc, notes: v })} multiline placeholder="Notes…" /></div>
                    </div>
                    <button onClick={() => delArr("locations", i)} style={{ background: "none", border: "none", color: "#ccc", cursor: "pointer", fontSize: 13, marginLeft: 8 }}
                      onMouseEnter={e => e.currentTarget.style.color = "#c0392b"} onMouseLeave={e => e.currentTarget.style.color = "#ccc"}>✕</button>
                  </div>
                </div>
              ))}
              <button onClick={() => addArr("locations", { name: "New Location", notes: "" })} style={{ background: "none", border: "none", color: "#9b9a97", fontSize: 13, cursor: "pointer", fontFamily: "inherit", padding: "4px 0" }}
                onMouseEnter={e => e.currentTarget.style.color = "#37352f"} onMouseLeave={e => e.currentTarget.style.color = "#9b9a97"}>+ Add location</button>
            </Section>
            <HR />

            <Section emoji="🎪" title="Props & Equipment">
              {(brief.props || []).map((p, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0" }}>
                  <span style={{ color: "#9b9a97" }}>·</span>
                  <div style={{ flex: 1, fontSize: 14 }}><Editable value={p} onChange={v => upArr("props", i, v)} /></div>
                  <button onClick={() => delArr("props", i)} style={{ background: "none", border: "none", color: "#ddd", cursor: "pointer", fontSize: 13 }}
                    onMouseEnter={e => e.currentTarget.style.color = "#c0392b"} onMouseLeave={e => e.currentTarget.style.color = "#ddd"}>✕</button>
                </div>
              ))}
              <button onClick={() => addArr("props", "New item")} style={{ background: "none", border: "none", color: "#9b9a97", fontSize: 13, cursor: "pointer", fontFamily: "inherit", padding: "4px 0" }}
                onMouseEnter={e => e.currentTarget.style.color = "#37352f"} onMouseLeave={e => e.currentTarget.style.color = "#9b9a97"}>+ Add item</button>
            </Section>
            <HR />

            <Section emoji="🎥" title="Shot List">
              <div style={{ overflowX: "auto" }}>
                <div style={{ display: "grid", gridTemplateColumns: "36px 80px 1fr 24px", gap: 8, padding: "6px 0", borderBottom: "1px solid #e8e4dc", minWidth: 320 }}>
                  {["#", "Type", "Description", ""].map((h, i) => <div key={i} style={{ fontSize: 10, fontFamily: "'IBM Plex Mono',monospace", color: "#9b9a97", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</div>)}
                </div>
                {(brief.shotList || []).map((shot, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "36px 80px 1fr 24px", gap: 8, alignItems: "start", padding: "9px 0", borderBottom: "1px solid #f7f6f3", minWidth: 320 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#9b9a97", paddingTop: 4 }}>{shot.number || String(i + 1).padStart(2, "0")}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#e97942" }}><Editable value={shot.type} onChange={v => upArr("shotList", i, { ...shot, type: v })} placeholder="Type" /></div>
                    <div style={{ fontSize: 13, lineHeight: 1.6 }}><Editable value={shot.description} onChange={v => upArr("shotList", i, { ...shot, description: v })} multiline placeholder="Describe the shot…" /></div>
                    <button onClick={() => delArr("shotList", i)} style={{ background: "none", border: "none", color: "#ccc", cursor: "pointer", fontSize: 13, paddingTop: 4 }}
                      onMouseEnter={e => e.currentTarget.style.color = "#c0392b"} onMouseLeave={e => e.currentTarget.style.color = "#ccc"}>✕</button>
                  </div>
                ))}
              </div>
              <button onClick={() => addArr("shotList", { number: String((brief.shotList?.length || 0) + 1).padStart(2, "0"), type: "B-Roll", description: "" })}
                style={{ background: "none", border: "none", color: "#9b9a97", fontSize: 13, cursor: "pointer", fontFamily: "inherit", padding: "4px 0", marginTop: 8 }}
                onMouseEnter={e => e.currentTarget.style.color = "#37352f"} onMouseLeave={e => e.currentTarget.style.color = "#9b9a97"}>+ Add shot</button>
            </Section>
            <HR />

            <Section emoji="✅" title="To-Do List">
              {(brief.toDoList || []).map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "5px 0" }}>
                  <input type="checkbox" checked={item.done} onChange={e => upArr("toDoList", i, { ...item, done: e.target.checked })}
                    style={{ marginTop: 3, cursor: "pointer", flexShrink: 0, width: 15, height: 15, accentColor: "#37352f" }} />
                  <div style={{ flex: 1, fontSize: 14, color: item.done ? "#9b9a97" : "#37352f", textDecoration: item.done ? "line-through" : "none", lineHeight: 1.6 }}>
                    <Editable value={item.text} onChange={v => upArr("toDoList", i, { ...item, text: v })} />
                  </div>
                  <button onClick={() => delArr("toDoList", i)} style={{ background: "none", border: "none", color: "#ddd", cursor: "pointer", fontSize: 13 }}
                    onMouseEnter={e => e.currentTarget.style.color = "#c0392b"} onMouseLeave={e => e.currentTarget.style.color = "#ddd"}>✕</button>
                </div>
              ))}
              <button onClick={() => addArr("toDoList", { text: "New task", done: false })} style={{ background: "none", border: "none", color: "#9b9a97", fontSize: 13, cursor: "pointer", fontFamily: "inherit", padding: "4px 0" }}
                onMouseEnter={e => e.currentTarget.style.color = "#37352f"} onMouseLeave={e => e.currentTarget.style.color = "#9b9a97"}>+ Add task</button>
            </Section>
            <HR />

            <Section emoji="🏷" title="Tags" defaultOpen={false}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {(brief.tags || []).map((tag, i) => (
                  <span key={i} style={{ background: "#f1f0ef", color: "#55534e", borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {tag}
                    <button onClick={() => delArr("tags", i)} style={{ background: "none", border: "none", color: "#ccc", cursor: "pointer", fontSize: 10, padding: 0 }}>✕</button>
                  </span>
                ))}
                <button onClick={() => addArr("tags", "new tag")} style={{ background: "none", border: "1px dashed #e8e4dc", color: "#9b9a97", borderRadius: 20, padding: "3px 12px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>+ Tag</button>
              </div>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

// ─── IDEA CAPTURE MAIN ────────────────────────────────────────────────────────
function IdeaCapture({ user, onBack }) {
  const storageKey = `framebrief_ideas_${user?.id}`;
  const wsKey = `framebrief_workspaces_${user?.id}`;

  const [workspaces, setWorkspaces] = useState(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(wsKey));
      return Array.isArray(parsed) ? parsed : DEFAULT_WORKSPACES;
    } catch { return DEFAULT_WORKSPACES; }
  });
  const [activeWs, setActiveWs] = useState(() => workspaces[0]?.id || "personal");
  const [ideas, setIdeas] = useState(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey) || "{}");
      return (parsed && typeof parsed === "object" && !Array.isArray(parsed)) ? parsed : {};
    } catch { return {}; }
  });
  const [openIdea, setOpenIdea] = useState(null);
  const [input, setInput] = useState("");
  const [interimText, setInterimText] = useState("");
  const [generating, setGenerating] = useState(null); // id of idea being generated
  const [creatingWs, setCreatingWs] = useState(false);
  const [newWsName, setNewWsName] = useState("");
  const [newWsEmoji, setNewWsEmoji] = useState("💡");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [editingWsId, setEditingWsId] = useState(null);
  const [editingWsName, setEditingWsName] = useState("");
  const [wsMenuOpen, setWsMenuOpen] = useState(null);

  function saveWorkspaces(updated) {
    setWorkspaces(updated);
    try { localStorage.setItem(wsKey, JSON.stringify(updated)); } catch {}
  }

  function saveIdeas(updated) {
    setIdeas(updated);
    try { localStorage.setItem(storageKey, JSON.stringify(updated)); } catch {}
  }

  function createWorkspace() {
    if (!newWsName.trim()) return;
    const id = `ws-${Date.now()}`;
    saveWorkspaces([...workspaces, { id, name: newWsName.trim(), emoji: newWsEmoji }]);
    setActiveWs(id);
    setCreatingWs(false); setNewWsName(""); setNewWsEmoji("💡"); setShowEmojiPicker(false);
  }

  function renameWorkspace(id, name) {
    saveWorkspaces((workspaces||[]).map(w => w.id === id ? { ...w, name } : w));
    setEditingWsId(null);
  }

  function deleteWorkspace(id) {
    if (!window.confirm("Delete this workspace and all its ideas?")) return;
    const updated = (workspaces||[]).filter(w => w.id !== id);
    saveWorkspaces(updated);
    const newIdeas = { ...ideas }; delete newIdeas[id]; saveIdeas(newIdeas);
    if (activeWs === id) setActiveWs(updated[0]?.id || "");
    setWsMenuOpen(null);
  }

  async function saveIdea() {
    const text = (input + interimText).trim();
    if (!text) return;
    const id = `idea-${Date.now()}`;
    const newIdea = { id, rawText: text, brief: null, createdAt: new Date().toISOString() };
    const wsIdeas = [newIdea, ...(ideas[activeWs] || [])];
    saveIdeas({ ...ideas, [activeWs]: wsIdeas });
    setInput(""); setInterimText("");
    // Generate brief for this idea
    setGenerating(id);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "anthropic-dangerous-direct-browser-access": "true", "x-api-key": API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: MODEL, max_tokens: 3000, system: IDEA_SYSTEM, messages: [{ role: "user", content: `Generate a creative brief for this idea:

${text}` }] })
      });
      const data = await res.json();
      const raw = (data.content || []).map(b => b.text || "").join("").trim();
      let jsonStr = raw;
      const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenced) jsonStr = fenced[1].trim();
      else { const s = raw.indexOf("{"), e = raw.lastIndexOf("}"); if (s !== -1 && e !== -1) jsonStr = raw.slice(s, e + 1); }
      jsonStr = jsonStr.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");
      const rawBrief = JSON.parse(jsonStr);
      // Ensure all array fields are actually arrays (AI sometimes returns null)
      const brief = {
        ...rawBrief,
        outline: Array.isArray(rawBrief.outline) ? rawBrief.outline : [],
        keyPoints: Array.isArray(rawBrief.keyPoints) ? rawBrief.keyPoints : [],
        locations: Array.isArray(rawBrief.locations) ? rawBrief.locations : [],
        props: Array.isArray(rawBrief.props) ? rawBrief.props : [],
        shotList: Array.isArray(rawBrief.shotList) ? rawBrief.shotList : [],
        toDoList: Array.isArray(rawBrief.toDoList) ? rawBrief.toDoList : [],
        tags: Array.isArray(rawBrief.tags) ? rawBrief.tags : [],
      };
      const updated = { ...ideas, [activeWs]: wsIdeas.map(idea => idea.id === id ? { ...idea, brief } : idea) };
      saveIdeas(updated);
    } catch (e) {
      console.error("Brief generation failed:", e);
    }
    setGenerating(null);
  }

  function updateIdea(updated) {
    const wsIdeas = (ideas[activeWs] || []).map(i => i.id === updated.id ? updated : i);
    saveIdeas({ ...ideas, [activeWs]: wsIdeas });
  }

  function deleteIdea(id) {
    saveIdeas({ ...ideas, [activeWs]: (ideas[activeWs] || []).filter(i => i.id !== id) });
  }

  const ws = workspaces.find(w => w.id === activeWs);
  const wsIdeas = ideas[activeWs] || [];

  const [ideaSidebarOpen, setIdeaSidebarOpen] = useState(true);

  // If viewing an idea, show full page
  if (openIdea) {
    const ideaData = wsIdeas.find(i => i.id === openIdea);
    if (ideaData) return (
      <IdeaPage idea={ideaData} onBack={() => setOpenIdea(null)} onUpdate={updateIdea} />
    );
  }

  // Sidebar content shared between desktop + mobile drawer
  function WorkspaceSidebarContent() {
    return (<>
      <div style={{ fontSize: 10, fontFamily: "'IBM Plex Mono',monospace", color: "#c4c3bf", textTransform: "uppercase", letterSpacing: "0.1em", padding: "0 10px", marginBottom: 8 }}>Workspaces</div>
      {(workspaces||[]).map(w => (
        <div key={w.id} style={{ position: "relative" }}>
          {editingWsId === w.id ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px" }}>
              <span style={{ fontSize: 15 }}>{w.emoji}</span>
              <input autoFocus value={editingWsName} onChange={e => setEditingWsName(e.target.value)}
                onBlur={() => renameWorkspace(w.id, editingWsName || w.name)}
                onKeyDown={e => { if (e.key === "Enter") renameWorkspace(w.id, editingWsName || w.name); if (e.key === "Escape") setEditingWsId(null); }}
                style={{ flex: 1, border: "1px solid #2383e2", borderRadius: 4, padding: "3px 6px", fontSize: 13, outline: "none", fontFamily: "'Lora',serif" }} />
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button className={`nb ${activeWs === w.id ? "on" : ""}`} onClick={() => { setActiveWs(w.id); setIdeaSidebarOpen(false); }} style={{ flex: 1 }}>
                <span style={{ fontSize: 15, flexShrink: 0 }}>{w.emoji}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", flex: 1, textAlign: "left" }}>{w.name}</span>
                {(ideas[w.id] || []).length > 0 && <span style={{ marginLeft: "auto", fontSize: 10, background: "#37352f", color: "#fff", borderRadius: 20, padding: "1px 6px", flexShrink: 0 }}>{(ideas[w.id] || []).length}</span>}
              </button>
              <button onClick={e => { e.stopPropagation(); setWsMenuOpen(wsMenuOpen === w.id ? null : w.id); }}
                style={{ background: "none", border: "none", color: "#c4c3bf", cursor: "pointer", fontSize: 14, padding: "4px 6px", borderRadius: 4, flexShrink: 0, lineHeight: 1 }}
                onMouseEnter={e => e.currentTarget.style.color = "#37352f"} onMouseLeave={e => e.currentTarget.style.color = "#c4c3bf"}>···</button>
            </div>
          )}
          {wsMenuOpen === w.id && (
            <div onClick={e => e.stopPropagation()} style={{ position: "absolute", right: 0, top: "100%", background: "#fff", border: "1px solid #f1f0ef", borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.1)", zIndex: 300, minWidth: 160, overflow: "hidden" }}>
              <button onClick={() => { setEditingWsId(w.id); setEditingWsName(w.name); setWsMenuOpen(null); }} style={{ display: "block", width: "100%", padding: "10px 14px", border: "none", background: "none", cursor: "pointer", fontSize: 13, color: "#37352f", textAlign: "left", fontFamily: "'Lora',serif" }}
                onMouseEnter={e => e.currentTarget.style.background = "#f7f6f3"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>✏️ Rename</button>
              <button onClick={() => deleteWorkspace(w.id)} style={{ display: "block", width: "100%", padding: "10px 14px", border: "none", background: "none", cursor: "pointer", fontSize: 13, color: "#c0392b", textAlign: "left", fontFamily: "'Lora',serif" }}
                onMouseEnter={e => e.currentTarget.style.background = "#fff2f2"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>🗑 Delete</button>
            </div>
          )}
        </div>
      ))}
      {creatingWs ? (
        <div onClick={e => e.stopPropagation()} style={{ padding: "10px", background: "#fff", border: "1px solid #e8e4dc", borderRadius: 8, marginTop: 8 }}>
          <div style={{ position: "relative", marginBottom: 8 }}>
            <button onClick={e => { e.stopPropagation(); setShowEmojiPicker(p => !p); }} style={{ background: "#f7f6f3", border: "1px solid #e8e4dc", borderRadius: 6, padding: "6px 10px", fontSize: 18, cursor: "pointer", width: "100%", textAlign: "center" }}>{newWsEmoji}</button>
            {showEmojiPicker && (
              <div onClick={e => e.stopPropagation()} style={{ position: "absolute", top: "110%", left: 0, right: 0, background: "#fff", border: "1px solid #e8e4dc", borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.12)", zIndex: 400, padding: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
                {EMOJIS.map(em => <button key={em} onClick={() => { setNewWsEmoji(em); setShowEmojiPicker(false); }} style={{ background: newWsEmoji === em ? "#e8f0fe" : "transparent", border: "none", borderRadius: 4, padding: "4px 6px", fontSize: 18, cursor: "pointer" }}>{em}</button>)}
              </div>
            )}
          </div>
          <input autoFocus value={newWsName} onChange={e => setNewWsName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") createWorkspace(); if (e.key === "Escape") { setCreatingWs(false); setShowEmojiPicker(false); } }}
            placeholder="Workspace name…"
            style={{ width: "100%", border: "1px solid #e8e4dc", borderRadius: 6, padding: "7px 10px", fontSize: 13, outline: "none", fontFamily: "'Lora',serif", marginBottom: 8 }}
            onFocus={e => e.target.style.borderColor = "#37352f"} onBlur={e => e.target.style.borderColor = "#e8e4dc"} />
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={createWorkspace} disabled={!newWsName.trim()} style={{ flex: 1, background: "#37352f", color: "#fff", border: "none", borderRadius: 6, padding: "7px", fontSize: 12, cursor: "pointer", fontFamily: "'Lora',serif", opacity: !newWsName.trim() ? 0.4 : 1 }}>Create</button>
            <button onClick={() => { setCreatingWs(false); setShowEmojiPicker(false); setNewWsName(""); }} style={{ flex: 1, background: "transparent", border: "1px solid #e8e4dc", borderRadius: 6, padding: "7px", fontSize: 12, cursor: "pointer", fontFamily: "'Lora',serif", color: "#9b9a97" }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setCreatingWs(true)} style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "8px 10px", border: "none", background: "none", cursor: "pointer", fontSize: 13, color: "#9b9a97", fontFamily: "'Lora',serif", marginTop: 8, borderRadius: 6 }}
          onMouseEnter={e => e.currentTarget.style.color = "#37352f"} onMouseLeave={e => e.currentTarget.style.color = "#9b9a97"}>+ New Workspace</button>
      )}
    </>);
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}
      onClick={() => { setWsMenuOpen(null); setShowEmojiPicker(false); }}>

      {/* Mobile sidebar overlay + drawer */}

      <div style={{ borderBottom: "1px solid #f1f0ef", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden", minWidth: 0 }}>
          <button onClick={e => { e.stopPropagation(); setIdeaSidebarOpen(true); }} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", padding: "2px 6px", color: "#37352f", flexShrink: 0 }}>☰</button>
          <button onClick={onBack} style={{ background: "none", border: "none", color: "#9b9a97", cursor: "pointer", fontSize: 13, fontFamily: "'Lora',serif", display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>← Dashboard</button>
          <span style={{ color: "#e8e4dc", flexShrink: 0 }}>·</span>
          <span style={{ fontSize: 16, flexShrink: 0 }}>💡</span>
          <span style={{ fontWeight: 700, fontSize: 14, color: "#37352f", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {ws ? ws.emoji + " " + ws.name : "Idea Capture"}
          </span>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Desktop sidebar */}
        {ideaSidebarOpen&&<div style={{ width: 220, borderRight: "1px solid #f1f0ef", padding: "16px 10px", background: "#fafaf9", flexShrink: 0, overflowY: "auto", display: "flex", flexDirection: "column" }}>
          {WorkspaceSidebarContent()}
        </div>}

        {/* Main content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "28px 24px 80px", maxWidth: 700 }}>
          {!ws ? (
            <p style={{ color: "#c4c3bf", fontStyle: "italic", fontSize: 14 }}>Select or create a workspace.</p>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
                <span style={{ fontSize: 28 }}>{ws.emoji}</span>
                <h1 style={{ fontSize: 24, fontWeight: 700, color: "#37352f", letterSpacing: "-0.02em" }}>{ws.name}</h1>
              </div>
              <p style={{ fontSize: 13, color: "#9b9a97", marginBottom: 24, fontStyle: "italic" }}>{(wsIdeas||[]).length} idea{(wsIdeas||[]).length !== 1 ? "s" : ""}</p>

              {/* Input */}
              <div style={{ background: "#fafaf9", border: "1px solid #e8e4dc", borderRadius: 10, padding: "16px", marginBottom: 24 }}>
                <div style={{ fontSize: 11, fontFamily: "'IBM Plex Mono',monospace", color: "#9b9a97", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Capture a new idea</div>
                <textarea
                  value={input + interimText}
                  onChange={e => { setInput(e.target.value); setInterimText(""); }}
                  onKeyDown={e => { if (e.key === "Enter" && e.metaKey) { e.preventDefault(); saveIdea(); } }}
                  placeholder={`Speak or type your idea for ${ws.name}…

AI will generate a full creative brief with script, shot list, locations, and to-dos.`}
                  rows={4}
                  style={{ width: "100%", border: "none", outline: "none", fontSize: 14, color: interimText ? "#9b9a97" : "#37352f", fontFamily: "'Lora',serif", lineHeight: 1.75, resize: "none", background: "transparent", marginBottom: 12 }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <VoiceMicBtn onTranscript={(final, interim) => { setInput(final); setInterimText(interim); }} />
                  <button onClick={saveIdea} disabled={!(input + interimText).trim()}
                    style={{ background: "#37352f", color: "#fff", border: "none", borderRadius: 6, padding: "9px 20px", fontSize: 13, cursor: "pointer", fontFamily: "'Lora',serif", opacity: !(input + interimText).trim() ? 0.4 : 1, display: "flex", alignItems: "center", gap: 8 }}>
                    ✦ Generate Brief
                  </button>
                </div>
              </div>

              {/* Ideas list */}
              {(wsIdeas||[]).length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 20px", color: "#c4c3bf" }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>{ws.emoji}</div>
                  <p style={{ fontSize: 14, fontStyle: "italic" }}>No ideas yet. Speak or type above — AI will build a full brief for you.</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {(wsIdeas||[]).map(idea => (
                    <div key={idea.id} onClick={() => idea.brief && setOpenIdea(idea.id)}
                      style={{ border: "1px solid #f1f0ef", borderRadius: 10, padding: "16px 18px", background: "#fafaf9", cursor: idea.brief ? "pointer" : "default", transition: "all .15s" }}
                      onMouseEnter={e => idea.brief && (e.currentTarget.style.background = "#f0ede8", e.currentTarget.style.borderColor = "#e0ddd8")}
                      onMouseLeave={e => (e.currentTarget.style.background = "#fafaf9", e.currentTarget.style.borderColor = "#f1f0ef")}>
                      {generating === idea.id && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                          <div className="spin" style={{ width: 14, height: 14, border: "2px solid #e8e4dc", borderTop: "2px solid #37352f", borderRadius: "50%", flexShrink: 0 }} />
                          <span style={{ fontSize: 12, color: "#9b9a97", fontStyle: "italic" }}>Building your creative brief…</span>
                        </div>
                      )}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {idea.brief ? (
                            <>
                              <div style={{ fontWeight: 700, fontSize: 15, color: "#37352f", marginBottom: 4 }}>{idea.brief.title || "Untitled"}</div>
                              <div style={{ fontSize: 13, color: "#9b9a97", fontStyle: "italic", marginBottom: 8, lineHeight: 1.5 }}>{idea.brief.logline}</div>
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                {idea.brief.format && <span style={{ fontSize: 11, background: "#f1f0ef", borderRadius: 20, padding: "2px 8px", color: "#9b9a97" }}>{idea.brief.format}</span>}
                                {idea.brief.estimatedLength && <span style={{ fontSize: 11, background: "#f1f0ef", borderRadius: 20, padding: "2px 8px", color: "#9b9a97" }}>{idea.brief.estimatedLength}</span>}
                                {(idea.brief.toDoList || []).length > 0 && <span style={{ fontSize: 11, background: "#e6f4ea", borderRadius: 20, padding: "2px 8px", color: "#1e7e34" }}>✅ {(idea.brief.toDoList||[]).filter(t => t.done).length}/{(idea.brief.toDoList||[]).length} tasks</span>}
                                {(idea.brief.shotList || []).length > 0 && <span style={{ fontSize: 11, background: "#e8f0fe", borderRadius: 20, padding: "2px 8px", color: "#1a56c4" }}>🎥 {(idea.brief.shotList||[]).length} shots</span>}
                              </div>
                            </>
                          ) : (
                            <div style={{ fontSize: 14, color: "#55534e", lineHeight: 1.65 }}>{idea.rawText.length > 120 ? idea.rawText.slice(0, 120) + "…" : idea.rawText}</div>
                          )}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                          {idea.brief && <span style={{ fontSize: 11, background: "#eeece8", borderRadius: 20, padding: "3px 10px", color: "#9b9a97" }}>Open →</span>}
                          <button onClick={e => { e.stopPropagation(); deleteIdea(idea.id); }} style={{ background: "none", border: "none", color: "#ddd", cursor: "pointer", fontSize: 14, padding: "2px 4px" }}
                            onMouseEnter={e => e.currentTarget.style.color = "#c0392b"} onMouseLeave={e => e.currentTarget.style.color = "#ddd"}>🗑</button>
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: "#c4c3bf", fontFamily: "'IBM Plex Mono',monospace", marginTop: 10 }}>
                        {new Date(idea.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── AUTH SCREEN ──────────────────────────────────────────────────────────────
function AuthScreen() {
  const [loading,setLoading]=useState(false);
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [mode,setMode]=useState("login");
  const [msg,setMsg]=useState("");
  const [err,setErr]=useState("");
  async function handleGoogle(){setLoading(true);setErr("");const{error}=await supabase.auth.signInWithOAuth({provider:"google",options:{redirectTo:window.location.origin}});if(error){setErr(error.message);setLoading(false);}}
  async function handleEmail(e){e.preventDefault();setLoading(true);setErr("");setMsg("");if(mode==="magic"){const{error}=await supabase.auth.signInWithOtp({email,options:{emailRedirectTo:window.location.origin}});if(error)setErr(error.message);else setMsg("Check your email for a magic link!");}else if(mode==="signup"){const{error}=await supabase.auth.signUp({email,password});if(error)setErr(error.message);else setMsg("Check your email to confirm your account!");}else{const{error}=await supabase.auth.signInWithPassword({email,password});if(error)setErr(error.message);}setLoading(false);}
  return(<div style={{minHeight:"100vh",background:"#fff",display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"}}><div style={{width:"100%",maxWidth:400}}><div style={{textAlign:"center",marginBottom:36}}><div style={{fontSize:44,marginBottom:12}}>🎬</div><h1 style={{fontSize:28,fontWeight:700,color:"#37352f",letterSpacing:"-0.02em",marginBottom:8}}>Frame Brief</h1><p style={{color:"#9b9a97",fontSize:14,fontStyle:"italic"}}>Creative production briefs for photographers &amp; videographers</p></div>{err&&<div style={{background:"#fff2f2",border:"1px solid #ffc9c9",borderRadius:8,padding:"10px 14px",marginBottom:16,fontSize:13,color:"#c0392b"}}>{err}</div>}{msg&&<div style={{background:"#e6f4ea",border:"1px solid #a8d5b5",borderRadius:8,padding:"10px 14px",marginBottom:16,fontSize:13,color:"#1e7e34"}}>{msg}</div>}<button onClick={handleGoogle} disabled={loading} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:12,padding:"13px 20px",border:"1px solid #e8e4dc",borderRadius:8,background:"#fff",cursor:"pointer",fontFamily:"'Lora',serif",fontSize:14,color:"#37352f",marginBottom:16}} onMouseEnter={e=>e.currentTarget.style.background="#f7f6f3"} onMouseLeave={e=>e.currentTarget.style.background="#fff"}><svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 002.38-5.88c0-.57-.05-.66-.15-1.18z"/><path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 01-7.18-2.54H1.83v2.07A8 8 0 008.98 17z"/><path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 010-3.04V5.41H1.83a8 8 0 000 7.18l2.67-2.07z"/><path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 001.83 5.4L4.5 7.49a4.77 4.77 0 014.48-3.31z"/></svg>{loading?"Signing in…":"Continue with Google"}</button><div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}><div style={{flex:1,height:1,background:"#f1f0ef"}}/><span style={{fontSize:12,color:"#c4c3bf"}}>or</span><div style={{flex:1,height:1,background:"#f1f0ef"}}/></div><form onSubmit={handleEmail}><input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="Email address" required style={{width:"100%",border:"1px solid #e8e4dc",borderRadius:8,padding:"12px 14px",fontFamily:"'Lora',serif",fontSize:14,color:"#37352f",outline:"none",marginBottom:10,background:"#fafaf9"}} onFocus={e=>e.target.style.borderColor="#37352f"} onBlur={e=>e.target.style.borderColor="#e8e4dc"}/>{mode!=="magic"&&<input value={password} onChange={e=>setPassword(e.target.value)} type="password" placeholder="Password" required style={{width:"100%",border:"1px solid #e8e4dc",borderRadius:8,padding:"12px 14px",fontFamily:"'Lora',serif",fontSize:14,color:"#37352f",outline:"none",marginBottom:10,background:"#fafaf9"}} onFocus={e=>e.target.style.borderColor="#37352f"} onBlur={e=>e.target.style.borderColor="#e8e4dc"}/>}<button type="submit" disabled={loading} style={{width:"100%",background:"#37352f",color:"#fff",border:"none",padding:"13px",borderRadius:8,fontFamily:"'Lora',serif",fontSize:14,cursor:"pointer",opacity:loading?0.6:1,marginBottom:14}}>{loading?"Loading…":mode==="login"?"Sign In":mode==="signup"?"Create Account":"Send Magic Link"}</button></form><div style={{display:"flex",flexDirection:"column",gap:6,alignItems:"center"}}>{mode==="login"&&<><button onClick={()=>{setMode("signup");setErr("");setMsg("");}} style={{background:"none",border:"none",color:"#9b9a97",fontSize:13,cursor:"pointer",fontFamily:"'Lora',serif"}}>Don't have an account? Sign up</button><button onClick={()=>{setMode("magic");setErr("");setMsg("");}} style={{background:"none",border:"none",color:"#9b9a97",fontSize:13,cursor:"pointer",fontFamily:"'Lora',serif"}}>Sign in with magic link instead</button></>}{mode==="signup"&&<button onClick={()=>{setMode("login");setErr("");setMsg("");}} style={{background:"none",border:"none",color:"#9b9a97",fontSize:13,cursor:"pointer",fontFamily:"'Lora',serif"}}>Already have an account? Sign in</button>}{mode==="magic"&&<button onClick={()=>{setMode("login");setErr("");setMsg("");}} style={{background:"none",border:"none",color:"#9b9a97",fontSize:13,cursor:"pointer",fontFamily:"'Lora',serif"}}>Back to sign in</button>}</div></div></div>);
}

// ─── EDITABLE ─────────────────────────────────────────────────────────────────
function Editable({value,onChange,multiline,placeholder="Click to edit…",style={}}){
  const[editing,setEditing]=useState(false);const[val,setVal]=useState(value??"");const ref=useRef();
  useEffect(()=>setVal(value??""),[value]);useEffect(()=>{if(editing)ref.current?.focus();},[editing]);
  const commit=()=>{setEditing(false);if(val!==(value??""))onChange(val);};
  const shared={fontFamily:"inherit",fontSize:"inherit",color:"inherit",lineHeight:"inherit",width:"100%",border:"none",outline:"none",background:"rgba(35,131,226,0.07)",borderRadius:4,padding:"3px 6px"};
  if(editing)return multiline?<textarea ref={ref} value={val} onChange={e=>setVal(e.target.value)} onBlur={commit} style={{...shared,resize:"vertical",minHeight:52}}/>:<input ref={ref} value={val} onChange={e=>setVal(e.target.value)} onBlur={commit} onKeyDown={e=>e.key==="Enter"&&commit()} style={shared}/>;
  return(<span onClick={()=>setEditing(true)} style={{cursor:"text",display:"block",borderRadius:4,padding:"3px 6px",minHeight:"1.4em",wordBreak:"break-word",transition:"background .12s",...style}} onMouseEnter={e=>e.currentTarget.style.background="rgba(55,53,47,0.06)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>{val||<span style={{color:"#c4c3bf",fontStyle:"italic"}}>{placeholder}</span>}</span>);
}

// ─── TAG ──────────────────────────────────────────────────────────────────────
function Tag({value,bg,color,onEdit,onDelete}){
  const[editing,setEditing]=useState(false);const[val,setVal]=useState(value);const ref=useRef();
  useEffect(()=>{if(editing)ref.current?.focus();},[editing]);
  const url=isURL(value);
  if(editing)return<input ref={ref} value={val} onChange={e=>setVal(e.target.value)} onBlur={()=>{setEditing(false);onEdit(val);}} onKeyDown={e=>e.key==="Enter"&&ref.current.blur()} style={{border:"1px solid #2383e2",borderRadius:20,padding:"3px 12px",fontSize:12,outline:"none",width:Math.max(64,val.length*9),fontFamily:"inherit",background:"#fff"}}/>;
  return(<span style={{display:"inline-flex",alignItems:"center",gap:3,background:bg,color,borderRadius:20,padding:"3px 12px 3px 10px",fontSize:12,fontWeight:500,userSelect:"none",margin:"2px 3px"}}>{url?<a href={value} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{color,textDecoration:"underline",maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"inline-block"}}>{value.replace(/^https?:\/\//,"").split("/")[0]}</a>:<span onClick={()=>setEditing(true)} style={{cursor:"text"}}>{value}</span>}<span onClick={onDelete} style={{cursor:"pointer",opacity:0.45,fontSize:9,marginLeft:2}}>✕</span></span>);
}

// ─── SECTION ─────────────────────────────────────────────────────────────────
function Section({emoji,title,children,defaultOpen=true,badge}){
  const[open,setOpen]=useState(defaultOpen);
  return(<div style={{marginBottom:2}}><button onClick={()=>setOpen(o=>!o)} style={{display:"flex",alignItems:"center",gap:8,width:"100%",background:"none",border:"none",padding:"9px 6px",cursor:"pointer",borderRadius:6,fontFamily:"inherit",textAlign:"left"}} onMouseEnter={e=>e.currentTarget.style.background="#f7f6f3"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}><span style={{fontSize:11,color:"#c4c3bf",display:"inline-block",transition:"transform .2s",transform:open?"rotate(90deg)":"rotate(0deg)"}}>▶</span><span style={{fontSize:15}}>{emoji}</span><span style={{fontSize:14,fontWeight:700,color:"#37352f",letterSpacing:"-0.01em"}}>{title}</span>{badge&&<span style={{fontSize:11,background:badge.bg,color:badge.c,borderRadius:20,padding:"2px 8px",fontWeight:600}}>{badge.label}</span>}</button>{open&&<div style={{paddingLeft:28,paddingBottom:10}}>{children}</div>}</div>);
}

// ─── TODO LIST ────────────────────────────────────────────────────────────────
function TodoList({items,onUpdate,onAdd,onDelete,accentColor="#37352f",readonly}){
  const[newText,setNewText]=useState("");const inputRef=useRef();
  function add(){if(!newText.trim())return;onAdd({id:`todo-${Date.now()}`,text:newText.trim(),done:false});setNewText("");inputRef.current?.focus();}
  return(<div>{(items||[]).map((item,i)=>(<div key={item.id||i} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"5px 0"}}><input type="checkbox" checked={item.done} onChange={e=>onUpdate(i,{...item,done:e.target.checked})} disabled={readonly} style={{marginTop:3,accentColor,cursor:readonly?"default":"pointer",flexShrink:0,width:15,height:15}}/><div style={{flex:1,fontSize:14,color:item.done?"#9b9a97":"#37352f",textDecoration:item.done?"line-through":"none",lineHeight:1.6}}>{readonly?<span>{item.text}</span>:<Editable value={item.text} onChange={v=>onUpdate(i,{...item,text:v})} placeholder="Add item…"/>}</div>{!readonly&&<button onClick={()=>onDelete(i)} style={{background:"none",border:"none",color:"#ddd",cursor:"pointer",fontSize:13,padding:"0 2px"}} onMouseEnter={e=>e.currentTarget.style.color="#c0392b"} onMouseLeave={e=>e.currentTarget.style.color="#ddd"}>✕</button>}</div>))}{!readonly&&(<div style={{display:"flex",alignItems:"center",gap:8,marginTop:6}}><input ref={inputRef} value={newText} onChange={e=>setNewText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()} placeholder="Add item… (Enter to save)" style={{flex:1,border:"none",outline:"none",fontSize:13,color:"#37352f",fontFamily:"inherit",padding:"4px 6px",borderRadius:4,background:"transparent"}} onFocus={e=>e.target.style.background="rgba(35,131,226,0.06)"} onBlur={e=>e.target.style.background="transparent"}/>{newText.trim()&&<button onClick={add} style={{background:"#37352f",color:"#fff",border:"none",borderRadius:4,padding:"4px 10px",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Add</button>}</div>)}</div>);
}

function PropRow({label,children}){
  return(<div style={{display:"flex",alignItems:"baseline",padding:"7px 16px",borderBottom:"1px solid #f1f0ef",gap:12}}><span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:11,color:"#9b9a97",minWidth:126,textTransform:"uppercase",letterSpacing:"0.06em",flexShrink:0,paddingTop:2}}>{label}</span><span style={{flex:1,fontSize:14,color:"#37352f"}}>{children}</span></div>);
}

function AddBtn({label,onClick}){
  return(<button onClick={onClick} style={{background:"none",border:"none",color:"#9b9a97",fontSize:13,cursor:"pointer",padding:"4px 0",fontFamily:"inherit",display:"flex",alignItems:"center",gap:4}} onMouseEnter={e=>e.currentTarget.style.color="#37352f"} onMouseLeave={e=>e.currentTarget.style.color="#9b9a97"}>+ {label}</button>);
}

const HR = () => <div style={{height:1,background:"#f1f0ef",margin:"14px 0"}}/>;

// ─── DOC UPLOAD ───────────────────────────────────────────────────────────────
function DocUpload({docs,onAdd,onRemove}){
  const[dragging,setDragging]=useState(false);
  const[processing,setProcessing]=useState(false);
  const inputRef=useRef();
  async function handleFiles(files){
    setProcessing(true);const results=[];
    for(const f of Array.from(files)){
      const type=ACCEPT[f.type];
      if(!type){results.push({error:`${f.name} — unsupported type`});continue;}
      if(f.size>10*1024*1024){results.push({error:`${f.name} — too large`});continue;}
      try{if(type==="pdf"){const b64=await readB64(f);results.push({name:f.name,type:"pdf",base64:b64,size:f.size});}else{const text=await readText(f);results.push({name:f.name,type:"text",content:text,size:f.size});}}catch{results.push({error:`${f.name} — could not read`});}
    }
    setProcessing(false);onAdd(results);
  }
  return(<div><div style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:12}}>Client Documents <span style={{color:"#c4c3bf",fontSize:10}}>(optional)</span></div><div onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);handleFiles(e.dataTransfer.files);}} onClick={()=>inputRef.current?.click()} style={{border:`2px dashed ${dragging?"#37352f":"#e8e4dc"}`,borderRadius:10,padding:"22px 20px",textAlign:"center",cursor:"pointer",background:dragging?"#f7f6f3":"#fafaf9",transition:"all .15s",marginBottom:docs.length>0?12:0}}><input ref={inputRef} type="file" multiple accept=".pdf,.txt,.doc,.docx,.md" onChange={e=>handleFiles(e.target.files)} style={{display:"none"}}/>{processing?<div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8}}><div className="spin" style={{width:16,height:16,border:"2px solid #e8e4dc",borderTop:"2px solid #37352f",borderRadius:"50%"}}/><span style={{fontSize:13,color:"#9b9a97"}}>Reading…</span></div>:<><div style={{fontSize:22,marginBottom:6}}>📎</div><p style={{fontSize:14,color:"#37352f",fontWeight:500,marginBottom:3}}>Drop files or click to browse</p><p style={{fontSize:12,color:"#9b9a97"}}>PDF, Word, TXT · Max 10MB</p></>}</div>{docs.filter(d=>!d.error).map((doc,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 14px",background:"#f7f6f3",borderRadius:8,marginBottom:6,border:"1px solid #eeece8"}}><span style={{fontSize:16}}>{doc.type==="pdf"?"📄":"📝"}</span><div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{doc.name}</div><div style={{fontSize:11,color:"#9b9a97"}}>{doc.type==="pdf"?"PDF":"Text"} · {fmtSize(doc.size)}</div></div><span style={{fontSize:11,background:"#e6f4ea",color:"#1e7e34",borderRadius:20,padding:"2px 8px",fontWeight:600,flexShrink:0}}>✓</span><button onClick={()=>onRemove(i)} style={{background:"none",border:"none",color:"#ccc",cursor:"pointer",fontSize:15,lineHeight:1,flexShrink:0}} onMouseEnter={e=>e.currentTarget.style.color="#c0392b"} onMouseLeave={e=>e.currentTarget.style.color="#ccc"}>✕</button></div>))}{docs.filter(d=>d.error).map((d,i)=><div key={`e${i}`} style={{fontSize:12,color:"#c0392b",padding:"4px 0"}}>⚠ {d.error}</div>)}</div>);
}

// ─── OVERVIEW PAGE ────────────────────────────────────────────────────────────
function OverviewPage({brief,setBrief,goTo,readonly}){
  const set=(k,v)=>setBrief(b=>({...b,[k]:v}));
  const upArr=(k,i,v)=>setBrief(b=>{const a=[...(b[k]||[])];a[i]=v;return{...b,[k]:a};});
  const delArr=(k,i)=>setBrief(b=>({...b,[k]:(b[k]||[]).filter((_,j)=>j!==i)}));
  const addArr=(k,item)=>setBrief(b=>({...b,[k]:[...(b[k]||[]),item]}));
  const cT=brief.clientActionItems||[];const iT=brief.internalTodos||[];
  return(
    <div style={{maxWidth:760,padding:"40px 24px 120px",margin:"0 auto"}}>
      <div style={{fontSize:48,marginBottom:10}}>{brief.coverEmoji||"🎬"}</div>
      {readonly?<h1 style={{fontSize:34,fontWeight:700,letterSpacing:"-0.025em",margin:"0 0 8px",color:"#37352f",lineHeight:1.2}}>{brief.projectTitle}</h1>:<h1 contentEditable suppressContentEditableWarning onBlur={e=>set("projectTitle",e.target.innerText)} style={{fontSize:34,fontWeight:700,letterSpacing:"-0.025em",margin:"0 0 8px",outline:"none",color:"#37352f",lineHeight:1.2}}>{brief.projectTitle}</h1>}
      <div style={{fontSize:15,color:"#9b9a97",fontStyle:"italic",marginBottom:20,lineHeight:1.6}}>{readonly?<p style={{margin:0}}>{brief.logline}</p>:<Editable value={brief.logline} onChange={v=>set("logline",v)} placeholder="Project logline…"/>}</div>
      <div style={{border:"1px solid #f1f0ef",borderRadius:10,overflow:"hidden",marginBottom:28}}>
        {[["Client","clientName"],["Project Type","projectType"],["Date","date"],["Timeline","timeline"],["Budget","budget"]].map(([l,k])=>(<PropRow key={k} label={l}>{readonly?brief[k]:<Editable value={brief[k]} onChange={v=>set(k,v)}/>}</PropRow>))}
      </div>
      <div style={{marginBottom:28}}>
        <div style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10}}>Concepts</div>
        {(brief.concepts||[]).map((c,i)=>(<div key={i} onClick={()=>goTo&&goTo(`concept-${i}`)} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 16px",border:"1px solid #f1f0ef",borderRadius:8,background:"#fafaf9",marginBottom:6,cursor:goTo?"pointer":"default",transition:"background .12s"}} onMouseEnter={e=>goTo&&(e.currentTarget.style.background="#f0ede8")} onMouseLeave={e=>e.currentTarget.style.background="#fafaf9"}><span style={{fontSize:22}}>{c.emoji||"🎬"}</span><div style={{flex:1}}><div style={{fontWeight:600,fontSize:14,color:"#37352f"}}>{c.title}</div><div style={{fontSize:12,color:"#9b9a97"}}>{c.type}{c.deliverableFormat?` · ${c.deliverableFormat}`:""}</div></div>{goTo&&<span style={{fontSize:11,background:"#eeece8",borderRadius:20,padding:"3px 10px",color:"#9b9a97",whiteSpace:"nowrap"}}>Open →</span>}</div>))}
      </div>
      <HR/>
      <Section emoji="✅" title="Client Action Items" badge={cT.length>0?{label:`${cT.filter(t=>t.done).length}/${cT.length}`,bg:"#e6f4ea",c:"#1e7e34"}:null}>
        <p style={{fontSize:12,color:"#9b9a97",marginBottom:12,fontStyle:"italic"}}>Things your client needs to complete before the shoot.</p>
        <TodoList items={cT} onUpdate={(i,v)=>upArr("clientActionItems",i,v)} onAdd={item=>addArr("clientActionItems",item)} onDelete={i=>delArr("clientActionItems",i)} accentColor="#1e7e34" readonly={readonly}/>
      </Section><HR/>
      {!readonly&&(<><Section emoji="🔒" title="Internal Team To-Do" badge={iT.length>0?{label:`${iT.filter(t=>t.done).length}/${iT.length}`,bg:"#fdeee4",c:"#b94a1a"}:null}><div style={{background:"#fffbf7",border:"1px solid #fdeee4",borderRadius:6,padding:"8px 12px",marginBottom:12}}><p style={{fontSize:12,color:"#b94a1a",margin:0}}>🔒 Internal only — not visible in Client View</p></div><TodoList items={iT} onUpdate={(i,v)=>upArr("internalTodos",i,v)} onAdd={item=>addArr("internalTodos",item)} onDelete={i=>delArr("internalTodos",i)} accentColor="#e97942" readonly={false}/></Section><HR/></>)}
      <Section emoji="📋" title="Project Overview"><div style={{fontSize:15,lineHeight:1.95}}>{readonly?<p style={{margin:0,whiteSpace:"pre-wrap"}}>{brief.overview}</p>:<Editable value={brief.overview} onChange={v=>set("overview",v)} multiline placeholder="Project overview…"/>}</div></Section><HR/>
      <Section emoji="🎭" title="Mood & Tone">
        <div style={{display:"flex",flexWrap:"wrap",marginBottom:12}}>{(brief.moodKeywords||[]).map((k,i)=>readonly?<span key={i} style={{background:"#fdeee4",color:"#b94a1a",borderRadius:20,padding:"3px 12px",fontSize:12,fontWeight:500,margin:"2px 3px"}}>{k}</span>:<Tag key={i} value={k} bg="#fdeee4" color="#b94a1a" onEdit={v=>upArr("moodKeywords",i,v)} onDelete={()=>delArr("moodKeywords",i)}/>)}{!readonly&&<AddBtn label="Add" onClick={()=>addArr("moodKeywords","new")}/>}</div>
        <div style={{fontSize:14,lineHeight:1.85,color:"#55534e",marginBottom:14}}>{readonly?<p style={{margin:0}}>{brief.moodDescription}</p>:<Editable value={brief.moodDescription} onChange={v=>set("moodDescription",v)} multiline placeholder="Overall mood…"/>}</div>
        <div style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>References & Links</div>
        <p style={{fontSize:12,color:"#c4c3bf",marginBottom:8,fontStyle:"italic"}}>Paste a URL to make it clickable.</p>
        <div style={{display:"flex",flexWrap:"wrap"}}>{(brief.references||[]).map((r,i)=>readonly?(isURL(r)?<a key={i} href={r} target="_blank" rel="noopener noreferrer" style={{background:"#e8f0fe",color:"#1a56c4",borderRadius:20,padding:"3px 12px",fontSize:12,fontWeight:500,margin:"2px 3px",textDecoration:"none"}}>{r.replace(/^https?:\/\//,"").split("/")[0]}</a>:<span key={i} style={{background:"#e8f0fe",color:"#1a56c4",borderRadius:20,padding:"3px 12px",fontSize:12,fontWeight:500,margin:"2px 3px"}}>{r}</span>):<Tag key={i} value={r} bg="#e8f0fe" color="#1a56c4" onEdit={v=>upArr("references",i,v)} onDelete={()=>delArr("references",i)}/>)}{!readonly&&<AddBtn label="Add reference or paste link" onClick={()=>addArr("references","https://")}/>}</div>
      </Section><HR/>
      <Section emoji="📍" title="Overall Locations">{(brief.overallLocations||[]).map((loc,i)=>(<div key={i} style={{padding:"12px 14px",background:"#f7f6f3",borderRadius:8,marginBottom:8,border:"1px solid #eeece8"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}><div style={{flex:1}}><div style={{fontWeight:700,fontSize:14,marginBottom:4}}>{readonly?loc.name:<Editable value={loc.name} onChange={v=>upArr("overallLocations",i,{...loc,name:v})} placeholder="Location name"/>}</div><div style={{fontSize:13,color:"#55534e",lineHeight:1.7}}>{readonly?<p style={{margin:0}}>{loc.description}</p>:<Editable value={loc.description} onChange={v=>upArr("overallLocations",i,{...loc,description:v})} multiline placeholder="Describe…"/>}</div></div>{!readonly&&<button onClick={()=>delArr("overallLocations",i)} style={{background:"none",border:"none",color:"#ccc",cursor:"pointer",fontSize:13,marginLeft:8}}>✕</button>}</div></div>))}{!readonly&&<AddBtn label="Add location" onClick={()=>addArr("overallLocations",{name:"New Location",description:""})}/>}</Section><HR/>
      <Section emoji="👗" title="Overall Wardrobe">{(brief.overallWardrobe||[]).map((item,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0"}}><span style={{color:"#e97942"}}>→</span><div style={{flex:1,fontSize:14}}>{readonly?item:<Editable value={item} onChange={v=>upArr("overallWardrobe",i,v)}/>}</div>{!readonly&&<button onClick={()=>delArr("overallWardrobe",i)} style={{background:"none",border:"none",color:"#ccc",cursor:"pointer",fontSize:11}}>✕</button>}</div>))}{!readonly&&<AddBtn label="Add item" onClick={()=>addArr("overallWardrobe","New item")}/>}</Section><HR/>
      <Section emoji="🎪" title="Overall Props">{(brief.overallProps||[]).map((p,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0"}}><span style={{color:"#9b9a97"}}>·</span><div style={{flex:1,fontSize:14}}>{readonly?p:<Editable value={p} onChange={v=>upArr("overallProps",i,v)}/>}</div>{!readonly&&<button onClick={()=>delArr("overallProps",i)} style={{background:"none",border:"none",color:"#ccc",cursor:"pointer",fontSize:11}}>✕</button>}</div>))}{!readonly&&<AddBtn label="Add prop" onClick={()=>addArr("overallProps","New prop")}/>}</Section><HR/>
      <Section emoji="📝" title="General Notes"><div style={{fontSize:14,lineHeight:1.85,color:"#55534e",borderLeft:"3px solid #e8e4dc",paddingLeft:16}}>{readonly?<p style={{margin:0,whiteSpace:"pre-wrap"}}>{brief.generalNotes}</p>:<Editable value={brief.generalNotes} onChange={v=>set("generalNotes",v)} multiline placeholder="Any general production notes…"/>}</div></Section>
    </div>
  );
}

// ─── CONCEPT PAGE ─────────────────────────────────────────────────────────────
function ConceptPage({concept,onChange,readonly}){
  const up=(k,v)=>onChange({...concept,[k]:v});
  const upN=(p,k,v)=>onChange({...concept,[p]:{...(concept[p]||{}),[k]:v}});
  const upArr=(k,i,v)=>{const a=[...(concept[k]||[])];a[i]=v;onChange({...concept,[k]:a});};
  const delArr=(k,i)=>onChange({...concept,[k]:(concept[k]||[]).filter((_,j)=>j!==i)});
  const addArr=(k,item)=>onChange({...concept,[k]:[...(concept[k]||[]),item]});
  const upScript=(k,v)=>onChange({...concept,script:{...(concept.script||{}),[k]:v}});
  return(
    <div style={{maxWidth:760,padding:"40px 24px 120px",margin:"0 auto"}}>
      <div style={{fontSize:44,marginBottom:10}}>{concept.emoji||"🎬"}</div>
      <div style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.14em",marginBottom:8}}>Concept</div>
      {readonly?<h1 style={{fontSize:32,fontWeight:700,letterSpacing:"-0.025em",margin:"0 0 8px",color:"#37352f",lineHeight:1.15}}>{concept.title}</h1>:<h1 contentEditable suppressContentEditableWarning onBlur={e=>up("title",e.target.innerText)} style={{fontSize:32,fontWeight:700,letterSpacing:"-0.025em",margin:"0 0 8px",outline:"none",color:"#37352f",lineHeight:1.15}}>{concept.title}</h1>}
      <div style={{fontSize:14,color:"#9b9a97",fontStyle:"italic",marginBottom:22,lineHeight:1.6}}>{readonly?<p style={{margin:0}}>{concept.logline}</p>:<Editable value={concept.logline} onChange={v=>up("logline",v)} placeholder="One sentence about this concept…"/>}</div>
      <div style={{border:"1px solid #f1f0ef",borderRadius:10,overflow:"hidden",marginBottom:28}}><PropRow label="Type">{readonly?concept.type:<Editable value={concept.type} onChange={v=>up("type",v)} placeholder="e.g. Music Video"/>}</PropRow><PropRow label="Deliverable">{readonly?concept.deliverableFormat:<Editable value={concept.deliverableFormat} onChange={v=>up("deliverableFormat",v)} placeholder="e.g. 4-min video"/>}</PropRow></div>
      <Section emoji="📋" title="Concept Description"><div style={{fontSize:15,lineHeight:1.95}}>{readonly?<p style={{margin:0,whiteSpace:"pre-wrap"}}>{concept.description}</p>:<Editable value={concept.description} onChange={v=>up("description",v)} multiline placeholder="Describe this concept…"/>}</div></Section><HR/>
      <Section emoji="🎭" title="Mood & Inspiration">
        <div style={{display:"flex",flexWrap:"wrap",marginBottom:12}}>{(concept.moodKeywords||[]).map((k,i)=>readonly?<span key={i} style={{background:"#fdeee4",color:"#b94a1a",borderRadius:20,padding:"3px 12px",fontSize:12,fontWeight:500,margin:"2px 3px"}}>{k}</span>:<Tag key={i} value={k} bg="#fdeee4" color="#b94a1a" onEdit={v=>upArr("moodKeywords",i,v)} onDelete={()=>delArr("moodKeywords",i)}/>)}{!readonly&&<AddBtn label="Add" onClick={()=>addArr("moodKeywords","mood")}/>}</div>
        <div style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>Visual References & Links</div>
        <p style={{fontSize:12,color:"#c4c3bf",marginBottom:8,fontStyle:"italic"}}>Paste a URL or type a reference name.</p>
        <div style={{display:"flex",flexWrap:"wrap"}}>{(concept.inspiration||[]).map((r,i)=>readonly?(isURL(r)?<a key={i} href={r} target="_blank" rel="noopener noreferrer" style={{background:"#e8f0fe",color:"#1a56c4",borderRadius:20,padding:"3px 12px",fontSize:12,fontWeight:500,margin:"2px 3px",textDecoration:"none"}}>{r.replace(/^https?:\/\//,"").split("/")[0]}</a>:<span key={i} style={{background:"#e8f0fe",color:"#1a56c4",borderRadius:20,padding:"3px 12px",fontSize:12,fontWeight:500,margin:"2px 3px"}}>{r}</span>):<Tag key={i} value={r} bg="#e8f0fe" color="#1a56c4" onEdit={v=>upArr("inspiration",i,v)} onDelete={()=>delArr("inspiration",i)}/>)}{!readonly&&<AddBtn label="Add reference or paste link" onClick={()=>addArr("inspiration","https://")}/>}</div>
      </Section><HR/>
      <Section emoji="📍" title="Locations">{(concept.locations||[]).map((loc,i)=>(<div key={i} style={{background:"#f7f6f3",borderRadius:8,padding:"14px 16px",marginBottom:10,border:"1px solid #eeece8"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}><div style={{flex:1}}><div style={{fontWeight:700,fontSize:14,marginBottom:2}}>{readonly?loc.name:<Editable value={loc.name} onChange={v=>upArr("locations",i,{...loc,name:v})} placeholder="Location name"/>}</div><div style={{fontSize:11,color:"#e97942",fontWeight:600,marginBottom:8}}>{readonly?loc.vibe:<Editable value={loc.vibe} onChange={v=>upArr("locations",i,{...loc,vibe:v})} placeholder="Vibe tag"/>}</div><div style={{fontSize:13,color:"#55534e",lineHeight:1.75,marginBottom:8}}>{readonly?<p style={{margin:0}}>{loc.description}</p>:<Editable value={loc.description} onChange={v=>upArr("locations",i,{...loc,description:v})} multiline placeholder="Describe…"/>}</div><div style={{borderTop:"1px solid #e8e4dc",paddingTop:8,fontSize:12,color:"#9b9a97"}}><span style={{fontWeight:600,color:"#55534e"}}>Shot opportunities: </span>{readonly?loc.shots:<Editable value={loc.shots} onChange={v=>upArr("locations",i,{...loc,shots:v})} multiline placeholder="What can we capture here?"/>}</div></div>{!readonly&&<button onClick={()=>delArr("locations",i)} style={{background:"none",border:"none",color:"#ccc",cursor:"pointer",fontSize:13,marginLeft:10}}>✕</button>}</div></div>))}{!readonly&&<AddBtn label="Add location" onClick={()=>addArr("locations",{name:"New Location",vibe:"",description:"",shots:""})}/>}</Section><HR/>
      <Section emoji="💡" title="Lighting"><div style={{border:"1px solid #f1f0ef",borderRadius:8,overflow:"hidden",marginBottom:14}}><PropRow label="Style"><span style={{fontWeight:600}}>{readonly?concept.lighting?.style:<Editable value={concept.lighting?.style} onChange={v=>upN("lighting","style",v)} placeholder="e.g. Golden Hour Natural"/>}</span></PropRow></div><div style={{fontSize:14,lineHeight:1.85,color:"#55534e",marginBottom:14}}>{readonly?<p style={{margin:0}}>{concept.lighting?.description}</p>:<Editable value={concept.lighting?.description} onChange={v=>upN("lighting","description",v)} multiline placeholder="Describe the lighting approach…"/>}</div><div style={{background:"#f9f8f6",borderRadius:6,padding:"12px 16px"}}><div style={{fontSize:10,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>Technical Notes</div><div style={{fontSize:13,fontFamily:"'IBM Plex Mono',monospace",color:"#55534e",lineHeight:1.75}}>{readonly?concept.lighting?.technical:<Editable value={concept.lighting?.technical} onChange={v=>upN("lighting","technical",v)} multiline placeholder="Camera settings, equipment…"/>}</div></div></Section><HR/>
      <Section emoji="🎨" title="Color Palette"><div style={{display:"flex",gap:16,marginBottom:16,flexWrap:"wrap"}}>{(concept.colorHex||[]).map((h,i)=><div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}><div style={{width:52,height:52,borderRadius:12,background:h,border:"1px solid rgba(0,0,0,0.08)"}}/><span style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97"}}>{h}</span></div>)}</div><div style={{fontSize:14,color:"#55534e",lineHeight:1.75}}>{readonly?<p style={{margin:0}}>{concept.colorDescription}</p>:<Editable value={concept.colorDescription} onChange={v=>up("colorDescription",v)} multiline placeholder="Describe the palette…"/>}</div></Section><HR/>
      <Section emoji="👗" title="Wardrobe & Styling">{(concept.wardrobe||[]).map((item,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0"}}><span style={{color:"#e97942"}}>→</span><div style={{flex:1,fontSize:14}}>{readonly?item:<Editable value={item} onChange={v=>upArr("wardrobe",i,v)}/>}</div>{!readonly&&<button onClick={()=>delArr("wardrobe",i)} style={{background:"none",border:"none",color:"#ccc",cursor:"pointer",fontSize:11}}>✕</button>}</div>))}{!readonly&&<AddBtn label="Add item" onClick={()=>addArr("wardrobe","New item")}/>}{concept.wardrobeNotes&&<div style={{fontSize:13,color:"#9b9a97",borderLeft:"3px solid #e8e4dc",paddingLeft:14,marginTop:12}}>{readonly?concept.wardrobeNotes:<Editable value={concept.wardrobeNotes} onChange={v=>up("wardrobeNotes",v)} multiline/>}</div>}</Section><HR/>
      <Section emoji="🎪" title="Props">{(concept.props||[]).map((p,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0"}}><span style={{color:"#9b9a97"}}>·</span><div style={{flex:1,fontSize:14}}>{readonly?p:<Editable value={p} onChange={v=>upArr("props",i,v)}/>}</div>{!readonly&&<button onClick={()=>delArr("props",i)} style={{background:"none",border:"none",color:"#ccc",cursor:"pointer",fontSize:11}}>✕</button>}</div>))}{!readonly&&<AddBtn label="Add prop" onClick={()=>addArr("props","New prop")}/>}</Section><HR/>
      <Section emoji="🎥" title="Shot List"><div style={{borderTop:"1px solid #f1f0ef",overflowX:"auto"}}><div style={{display:"grid",gridTemplateColumns:"36px 80px 1fr 80px 24px",gap:8,padding:"6px 0",borderBottom:"1px solid #e8e4dc",minWidth:400}}>{["#","Type","Description","Lens",""].map((h,i)=><div key={i} style={{fontSize:10,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.06em"}}>{h}</div>)}</div>{(concept.shotList||[]).map((shot,i)=>(<div key={i} style={{display:"grid",gridTemplateColumns:"36px 80px 1fr 80px 24px",gap:8,alignItems:"start",padding:"10px 0",borderBottom:"1px solid #f7f6f3",minWidth:400}}><div style={{fontSize:11,fontWeight:700,color:"#9b9a97",paddingTop:4}}>{shot.number||String(i+1).padStart(2,"0")}</div><div style={{fontSize:12,fontWeight:600,color:"#e97942"}}>{readonly?shot.type:<Editable value={shot.type} onChange={v=>upArr("shotList",i,{...shot,type:v})} placeholder="Type"/>}</div><div><div style={{fontSize:13,lineHeight:1.6}}>{readonly?shot.description:<Editable value={shot.description} onChange={v=>upArr("shotList",i,{...shot,description:v})} multiline placeholder="Describe…"/>}</div>{shot.notes&&<div style={{fontSize:11,color:"#9b9a97",marginTop:2}}>{readonly?shot.notes:<Editable value={shot.notes} onChange={v=>upArr("shotList",i,{...shot,notes:v})} placeholder="Notes…"/>}</div>}</div><div style={{fontSize:11,color:"#9b9a97"}}>{readonly?shot.lens:<Editable value={shot.lens} onChange={v=>upArr("shotList",i,{...shot,lens:v})} placeholder="Lens"/>}</div>{!readonly&&<button onClick={()=>delArr("shotList",i)} style={{background:"none",border:"none",color:"#ccc",cursor:"pointer",fontSize:13,paddingTop:4}}>✕</button>}</div>))}</div>{!readonly&&<div style={{marginTop:8}}><AddBtn label="Add shot" onClick={()=>addArr("shotList",{number:String((concept.shotList?.length||0)+1).padStart(2,"0"),type:"B-Roll",description:"",lens:"",notes:""})} /></div>}</Section><HR/>
      <Section emoji="📝" title="Script Outline">{[["Opening Hook","hook"],["Act I — Setup","act1"],["Act II — Journey","act2"],["Act III — Resolution","act3"],["Closing / CTA","cta"]].map(([label,key])=>(<div key={key} style={{background:"#f9f8f6",borderLeft:"3px solid #e8e4dc",padding:"14px 18px",borderRadius:"0 8px 8px 0",marginBottom:10}}><div style={{fontSize:10,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6}}>{label}</div><div style={{fontSize:14,lineHeight:1.85}}>{readonly?<p style={{margin:0}}>{concept.script?.[key]}</p>:<Editable value={concept.script?.[key]} onChange={v=>upScript(key,v)} multiline placeholder={`Write the ${label.toLowerCase()}…`}/>}</div></div>))}</Section><HR/>
      <Section emoji="✍️" title="Director's Notes"><div style={{fontSize:15,lineHeight:1.95,color:"#55534e",fontStyle:"italic",borderLeft:"3px solid #e97942",paddingLeft:18}}>{readonly?<p style={{margin:0}}>{concept.directorNotes}</p>:<Editable value={concept.directorNotes} onChange={v=>up("directorNotes",v)} multiline placeholder="Your creative vision for this concept…"/>}</div></Section>
    </div>
  );
}


// ─── MEETING BOT ─────────────────────────────────────────────────────────────
const RECALL_KEY = import.meta.env.VITE_RECALL_API_KEY || "";
const RECALL_REGION = "us-west-2"; // matches your account region

async function startRecallBot(meetingUrl, projectId) {
  // Create bot via Recall.ai API
  const res = await fetch(`https://${RECALL_REGION}.recall.ai/api/v1/bot/`, {
    method: "POST",
    headers: {
      "Authorization": `Token ${RECALL_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      meeting_url: meetingUrl,
      bot_name: "Frame Brief",
      transcription_options: { provider: "assembly_ai" },
      webhook_url: `${window.location.origin}/api/recall-webhook`,
    })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err?.message || err?.detail || "Failed to start bot");
  }
  return await res.json();
}

function MeetingBotPanel({ projectId, onBotStarted, recallStatus }) {
  const [meetingUrl, setMeetingUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [botStarted, setBotStarted] = useState(false);

  async function handleStart() {
    if (!meetingUrl.trim()) return;
    setLoading(true); setError("");
    try {
      const bot = await startRecallBot(meetingUrl.trim(), projectId);
      setBotStarted(true);
      onBotStarted(bot.id);
    } catch(err) {
      setError(err.message);
    }
    setLoading(false);
  }

  if (recallStatus === "transcript_ready") return (
    <div style={{background:"#e6f4ea",border:"1px solid #a8d5b5",borderRadius:10,padding:"14px 18px",marginBottom:20}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
        <span style={{fontSize:16}}>✅</span>
        <span style={{fontWeight:700,fontSize:14,color:"#1e7e34"}}>Transcript received!</span>
      </div>
      <p style={{fontSize:13,color:"#1e7e34",margin:0}}>Your meeting transcript is ready. Generate a brief from it below.</p>
    </div>
  );

  if (botStarted || recallStatus === "bot_joined") return (
    <div style={{background:"#e8f0fe",border:"1px solid #b3c9f9",borderRadius:10,padding:"14px 18px",marginBottom:20}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
        <div className="spin" style={{width:14,height:14,border:"2px solid #b3c9f9",borderTop:"2px solid #1a56c4",borderRadius:"50%",flexShrink:0}}/>
        <span style={{fontWeight:700,fontSize:14,color:"#1a56c4"}}>Bot is in your meeting</span>
      </div>
      <p style={{fontSize:13,color:"#1a56c4",margin:0}}>Recording and transcribing. When the meeting ends, your brief will be ready automatically.</p>
    </div>
  );

  return (
    <div style={{background:"#fafaf9",border:"1px solid #e8e4dc",borderRadius:10,padding:"18px",marginBottom:20}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
        <span style={{fontSize:18}}>🤖</span>
        <span style={{fontWeight:700,fontSize:14,color:"#37352f"}}>Meeting Bot</span>
        <span style={{fontSize:11,background:"#e8f0fe",color:"#1a56c4",borderRadius:20,padding:"2px 8px",fontWeight:600}}>Beta</span>
      </div>
      <p style={{fontSize:13,color:"#9b9a97",marginBottom:12,lineHeight:1.6}}>
        Paste your Google Meet, Zoom, or Teams link. A bot will join, record, and auto-generate your brief when the call ends.
      </p>
      {error && <div style={{background:"#fff2f2",border:"1px solid #ffc9c9",borderRadius:6,padding:"8px 12px",marginBottom:10,fontSize:12,color:"#c0392b"}}>{error}</div>}
      <div style={{display:"flex",gap:8}}>
        <input
          value={meetingUrl}
          onChange={e=>setMeetingUrl(e.target.value)}
          placeholder="https://meet.google.com/xxx-xxxx-xxx"
          style={{flex:1,border:"1px solid #e8e4dc",borderRadius:6,padding:"10px 14px",fontSize:13,fontFamily:"'Lora',serif",outline:"none",color:"#37352f"}}
          onFocus={e=>e.target.style.borderColor="#37352f"}
          onBlur={e=>e.target.style.borderColor="#e8e4dc"}
          onKeyDown={e=>e.key==="Enter"&&handleStart()}
        />
        <button onClick={handleStart} disabled={!meetingUrl.trim()||loading}
          style={{background:"#37352f",color:"#fff",border:"none",borderRadius:6,padding:"10px 20px",fontSize:13,cursor:"pointer",fontFamily:"'Lora',serif",opacity:!meetingUrl.trim()||loading?0.4:1,whiteSpace:"nowrap"}}>
          {loading?"Starting…":"Send Bot →"}
        </button>
      </div>
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({projects,onOpen,onNew,onDelete,onStatusChange,user,onSignOut,onIdeas}){
  const[search,setSearch]=useState("");
  const[filter,setFilter]=useState("All");
  const[sidebarOpen,setSidebarOpen]=useState(true);
  const filtered=[...projects].filter(p=>{const q=search.toLowerCase();const ms=!q||[p.title,p.client_name,p.brief?.projectType].some(s=>s?.toLowerCase().includes(q));return ms&&(filter==="All"||p.status===filter);}).sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at));

  function DashSidebar(){return(<>
    <button onClick={()=>setSidebarOpen(false)} style={{display:"flex",alignItems:"center",gap:6,width:"100%",padding:"10px 14px",border:"none",background:"none",cursor:"pointer",fontSize:13,color:"#9b9a97",fontFamily:"'Lora',serif",borderBottom:"1px solid #f1f0ef",marginBottom:16}}>← Close Menu</button>
    <div style={{padding:"0 10px"}}>
      <div style={{fontSize:10,fontFamily:"'IBM Plex Mono',monospace",color:"#c4c3bf",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:12}}>Navigation</div>
      <button onClick={onNew} style={{display:"flex",alignItems:"center",gap:8,width:"100%",padding:"9px 10px",border:"none",background:"#37352f",color:"#fff",borderRadius:6,cursor:"pointer",fontSize:13,fontFamily:"'Lora',serif",marginBottom:8}}>🎬 <span>New Brief</span></button>
      <button onClick={onIdeas} className="nb" style={{marginBottom:4}}><span style={{fontSize:15}}>💡</span><span>Idea Capture</span></button>
      <div style={{marginTop:24,fontSize:10,fontFamily:"'IBM Plex Mono',monospace",color:"#c4c3bf",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10}}>Account</div>
      <div style={{fontSize:12,color:"#9b9a97",padding:"4px 10px",marginBottom:8,lineHeight:1.5,wordBreak:"break-all"}}>{user?.email}</div>
      <button onClick={onSignOut} className="nb"><span style={{fontSize:15}}>🚪</span><span>Sign Out</span></button>
    </div>
  </>);}

  return(
    <div style={{minHeight:"100vh",background:"#fff",display:"flex",flexDirection:"column"}}>
      {/* Header */}
      <div style={{borderBottom:"1px solid #f1f0ef",padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button onClick={()=>setSidebarOpen(o=>!o)} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",padding:"2px 6px",color:"#37352f"}}>☰</button>
          <span style={{fontSize:18}}>🎬</span>
          <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:11,color:"#37352f",fontWeight:500,letterSpacing:"0.08em"}}>FRAME BRIEF</span>
        </div>
        <button onClick={onNew} style={{background:"#37352f",color:"#fff",border:"none",padding:"8px 16px",borderRadius:6,fontFamily:"'Lora',serif",fontSize:13,cursor:"pointer"}}>+ New Brief</button>
      </div>

      <div style={{display:"flex",flex:1,overflow:"hidden",minHeight:"calc(100vh - 53px)"}}>
        {/* Collapsible sidebar */}
        {sidebarOpen&&<div style={{width:220,borderRight:"1px solid #f1f0ef",padding:"16px 10px",background:"#fafaf9",flexShrink:0,overflowY:"auto"}}>{DashSidebar()}</div>}

        {/* Main content */}
        <div style={{flex:1,overflowY:"auto",padding:"32px 24px"}}>
          <h1 style={{fontSize:26,fontWeight:700,color:"#37352f",marginBottom:20,letterSpacing:"-0.02em"}}>Projects</h1>
          <div style={{display:"flex",gap:10,marginBottom:24,flexWrap:"wrap"}}>
            <div style={{flex:1,minWidth:180,position:"relative"}}><span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:14,color:"#9b9a97"}}>🔍</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search projects…" style={{width:"100%",border:"1px solid #e8e4dc",borderRadius:8,padding:"10px 14px 10px 36px",fontFamily:"'Lora',serif",fontSize:13,color:"#37352f",outline:"none",background:"#fafaf9",boxSizing:"border-box"}} onFocus={e=>e.target.style.borderColor="#37352f"} onBlur={e=>e.target.style.borderColor="#e8e4dc"}/></div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{["All",...STATUSES].map(s=><button key={s} onClick={()=>setFilter(s)} style={{padding:"7px 12px",borderRadius:20,border:"1px solid",borderColor:filter===s?"#37352f":"#e8e4dc",background:filter===s?"#37352f":"transparent",color:filter===s?"#fff":"#9b9a97",fontFamily:"'Lora',serif",fontSize:12,cursor:"pointer",whiteSpace:"nowrap"}}>{s}</button>)}</div>
          </div>
          {filtered.length===0?(<div style={{textAlign:"center",padding:"60px 20px"}}><div style={{fontSize:44,marginBottom:14}}>🎬</div><p style={{fontSize:17,fontWeight:600,color:"#37352f",marginBottom:8}}>{search||filter!=="All"?"No projects match":"No projects yet"}</p><p style={{fontSize:14,color:"#9b9a97",marginBottom:20}}>{search||filter!=="All"?"Try different filters":"Create your first production brief."}</p>{!search&&filter==="All"&&<button onClick={onNew} style={{background:"#37352f",color:"#fff",border:"none",padding:"11px 24px",borderRadius:6,fontFamily:"'Lora',serif",fontSize:14,cursor:"pointer"}}>+ Create First Brief</button>}</div>)
          :(<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(240px, 1fr))",gap:14}}>{filtered.map(p=>(<div key={p.id} onClick={()=>onOpen(p)} style={{border:"1px solid #f1f0ef",borderRadius:10,padding:"18px",background:"#fafaf9",cursor:"pointer",transition:"all .15s"}} onMouseEnter={e=>{e.currentTarget.style.background="#f0ede8";e.currentTarget.style.borderColor="#e0ddd8";}} onMouseLeave={e=>{e.currentTarget.style.background="#fafaf9";e.currentTarget.style.borderColor="#f1f0ef";}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}><span style={{fontSize:26}}>{p.brief?.coverEmoji||"🎬"}</span><div style={{display:"flex",alignItems:"center",gap:6}} onClick={e=>e.stopPropagation()}><StatusBadge status={p.status} onChange={s=>onStatusChange(p.id,s)}/><button onClick={e=>{e.stopPropagation();if(window.confirm("Delete this project?"))onDelete(p.id);}} style={{background:"none",border:"none",color:"#ddd",cursor:"pointer",fontSize:13,padding:"2px 4px"}} onMouseEnter={e=>e.currentTarget.style.color="#c0392b"} onMouseLeave={e=>e.currentTarget.style.color="#ddd"}>🗑</button></div></div><div style={{fontWeight:700,fontSize:14,color:"#37352f",marginBottom:4,lineHeight:1.3}}>{p.title||"Untitled"}</div><div style={{fontSize:12,color:"#9b9a97",marginBottom:8}}>{p.client_name}{p.brief?.projectType?` · ${p.brief.projectType}`:""}</div><div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}>{arr(p.brief?.concepts).map((c,i)=><span key={i} style={{fontSize:11,background:"#f1f0ef",borderRadius:20,padding:"2px 8px",color:"#9b9a97"}}>{c.emoji} {c.title}</span>)}</div>{p.doc_count>0&&<div style={{fontSize:11,color:"#9b9a97",marginBottom:4}}>📎 {p.doc_count} doc{p.doc_count>1?"s":""}</div>}<div style={{fontSize:11,color:"#c4c3bf",fontFamily:"'IBM Plex Mono',monospace"}}>Updated {new Date(p.updated_at).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</div></div>))}</div>)}
        </div>
      </div>
    </div>
  );
}

// ─── AI CHAT ─────────────────────────────────────────────────────────────────
function AIChatPanel({chatLog,onSend,busy,onClose}){
  const[input,setInput]=useState("");
  const taRef=useRef();const endRef=useRef();
  useEffect(()=>{endRef.current?.scrollIntoView({behavior:"smooth"});},[chatLog,busy]);
  useEffect(()=>{const ta=taRef.current;if(!ta)return;ta.style.height="auto";ta.style.height=Math.min(ta.scrollHeight,160)+"px";},[input]);
  function send(){if(!input.trim()||busy)return;onSend(input.trim());setInput("");if(taRef.current)taRef.current.style.height="auto";}
  return(
    <div style={{display:"flex",flexDirection:"column",height:"100%",background:"#fafaf9"}}>
      <div style={{padding:"14px 18px",borderBottom:"1px solid #f1f0ef",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
        <div><div style={{fontSize:13,fontWeight:700,color:"#37352f",marginBottom:2}}>✦ AI Creative Director</div><div style={{fontSize:12,color:"#9b9a97"}}>Full chat history remembered</div></div>
        <button onClick={onClose} style={{background:"none",border:"none",color:"#9b9a97",cursor:"pointer",fontSize:20,lineHeight:1,padding:"2px 4px"}}>✕</button>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"16px",display:"flex",flexDirection:"column",gap:12}}>
        {chatLog.length===0&&(<div style={{marginTop:24}}><p style={{color:"#c4c3bf",fontSize:13,textAlign:"center",lineHeight:1.9,fontStyle:"italic",marginBottom:16}}>I remember everything we discuss. Try:</p>{["Add a drone shot to the shot list","Make the script hook more emotional","Add a rooftop location","Create a new social content concept"].map(s=>(<button key={s} onClick={()=>{setInput(s);taRef.current?.focus();}} style={{display:"block",width:"100%",textAlign:"left",background:"#fff",border:"1px solid #f1f0ef",borderRadius:8,padding:"9px 12px",fontSize:12,color:"#55534e",cursor:"pointer",fontFamily:"'Lora',serif",marginBottom:6}} onMouseEnter={e=>{e.currentTarget.style.background="#f7f6f3";e.currentTarget.style.borderColor="#e0ddd8";}} onMouseLeave={e=>{e.currentTarget.style.background="#fff";e.currentTarget.style.borderColor="#f1f0ef";}}>{s}</button>))}</div>)}
        {chatLog.map((m,i)=>(<div key={i} style={{display:"flex",flexDirection:m.role==="user"?"row-reverse":"row",gap:8}}>{m.role==="assistant"&&<div style={{width:24,height:24,borderRadius:"50%",background:"#37352f",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,flexShrink:0,marginTop:2,color:"#fff"}}>✦</div>}<div style={{maxWidth:"82%",background:m.role==="user"?"#37352f":"#fff",color:m.role==="user"?"#fff":"#37352f",borderRadius:m.role==="user"?"12px 12px 4px 12px":"12px 12px 12px 4px",padding:"10px 14px",fontSize:13,lineHeight:1.65,border:m.role==="assistant"?"1px solid #f1f0ef":"none",wordBreak:"break-word"}}>{m.content}</div></div>))}
        {busy&&<div style={{display:"flex",gap:8,alignItems:"center"}}><div style={{width:24,height:24,borderRadius:"50%",background:"#37352f",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,flexShrink:0,color:"#fff"}}>✦</div><div style={{background:"#fff",border:"1px solid #f1f0ef",borderRadius:"12px 12px 12px 4px",padding:"10px 14px",display:"flex",gap:4}}>{[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:"#c4c3bf",animation:`bounce 1.2s ${i*0.2}s infinite`}}/>)}</div></div>}
        <div ref={endRef}/>
      </div>
      <div style={{padding:"12px 14px",borderTop:"1px solid #f1f0ef",background:"#fff",flexShrink:0}}>
        <div style={{border:"1px solid #e8e4dc",borderRadius:10,overflow:"hidden"}} onFocusCapture={e=>e.currentTarget.style.borderColor="#37352f"} onBlurCapture={e=>e.currentTarget.style.borderColor="#e8e4dc"}>
          <textarea ref={taRef} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&(e.preventDefault(),send())} placeholder="Ask me to change anything… (Enter to send)" style={{width:"100%",border:"none",outline:"none",padding:"12px 14px",fontSize:13,color:"#37352f",fontFamily:"'Lora',serif",lineHeight:1.6,resize:"none",background:"transparent",minHeight:44,maxHeight:160,overflowY:"auto",display:"block"}}/>
          {input&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",borderTop:"1px solid #f1f0ef"}}><span style={{fontSize:11,color:"#c4c3bf"}}>Shift+Enter for new line</span><button onClick={send} disabled={!input.trim()||busy} style={{background:"#37352f",color:"#fff",border:"none",borderRadius:6,padding:"6px 14px",fontSize:12,cursor:"pointer",fontFamily:"'Lora',serif",opacity:!input.trim()||busy?0.4:1}}>Send ↑</button></div>}
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
function FrameBriefApp(){
  const[user,setUser]=useState(null);
  const[authLoading,setAuthLoading]=useState(true);
  const[screen,setScreen]=useState("dashboard");
  const[projects,setProjects]=useState([]);
  const[activeProject,setActiveProject]=useState(null);
  const[transcript,setTranscript]=useState("");
  const[docs,setDocs]=useState([]);
  const[page,setPage]=useState("overview");
  const[loadMsg,setLoadMsg]=useState("Reading your transcript…");
  const[errMsg,setErrMsg]=useState("");
  const[shareMode,setShareMode]=useState(false);
  const[sidebarOpen,setSidebarOpen]=useState(true);
  const[chatOpen,setChatOpen]=useState(false);
  const[chatLog,setChatLog]=useState([]);
  const[chatBusy,setChatBusy]=useState(false);
  const[copied,setCopied]=useState(false);
  const[dbSaving,setDbSaving]=useState(false);
  const brief=activeProject?.brief||null;

  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>{setUser(session?.user??null);setAuthLoading(false);});
    const{data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{setUser(session?.user??null);});
    // Close mobile drawer if window resizes to desktop
    const handleResize = () => { if(window.innerWidth > 768){setSidebarOpen(false);} };
    window.addEventListener('resize', handleResize);
    return()=>{ subscription.unsubscribe(); window.removeEventListener('resize', handleResize); };
  },[]);

  useEffect(()=>{if(user)loadProjects();},[user]);

  // Poll for transcript when bot is in a meeting
  useEffect(()=>{
    if(!activeProject?.id || activeProject?.recall_status !== "bot_joined") return;
    const interval = setInterval(async () => {
      const { data } = await supabase.from("projects").select("recall_status,recall_transcript").eq("id", activeProject.id).single();
      if (data?.recall_status === "transcript_ready") {
        clearInterval(interval);
        setActiveProject(prev => ({...prev, ...data}));
        setProjects(ps => ps.map(p => p.id === activeProject.id ? {...p, ...data} : p));
      }
    }, 10000); // poll every 10s
    return () => clearInterval(interval);
  },[activeProject?.id, activeProject?.recall_status]);

  async function loadProjects(){
    const{data,error}=await supabase.from("projects").select("*").order("updated_at",{ascending:false});
    if(!error&&data)setProjects(data);
  }

  async function saveProject(projectData){
    setDbSaving(true);
    const{data,error}=await supabase.from("projects").upsert({id:projectData.id,user_id:user.id,title:projectData.brief?.projectTitle||"Untitled",client_name:projectData.brief?.clientName||"",status:projectData.status||"Draft",brief:projectData.brief||{},doc_count:projectData.doc_count||0,updated_at:new Date().toISOString()}).select().single();
    setDbSaving(false);
    if(!error&&data){setProjects(ps=>{const existing=ps.find(p=>p.id===data.id);return existing?ps.map(p=>p.id===data.id?data:p):[data,...ps];});return data;}
    return null;
  }

  async function deleteProject(id){
    await supabase.from("projects").delete().eq("id",id);
    setProjects(ps=>ps.filter(p=>p.id!==id));
    if(activeProject?.id===id){setActiveProject(null);setScreen("dashboard");}
  }

  async function updateStatus(id,status){
    await supabase.from("projects").update({status,updated_at:new Date().toISOString()}).eq("id",id);
    setProjects(ps=>ps.map(p=>p.id===id?{...p,status}:p));
    if(activeProject?.id===id)setActiveProject(p=>({...p,status}));
  }

  async function updateRecallStatus(projectId, botId, status) {
    if (!projectId) return;
    const updates = { recall_status: status, updated_at: new Date().toISOString() };
    if (botId) updates.recall_bot_id = botId;
    await supabase.from("projects").update(updates).eq("id", projectId);
    setProjects(ps => ps.map(p => p.id === projectId ? { ...p, ...updates } : p));
    setActiveProject(prev => prev?.id === projectId ? { ...prev, ...updates } : prev);
  }

  function setBrief(updater){
    setActiveProject(prev=>{
      if(!prev)return prev;
      const updatedBrief=typeof updater==="function"?updater(prev.brief):updater;
      const updated={...prev,brief:updatedBrief};
      clearTimeout(window._briefSaveTimer);
      window._briefSaveTimer=setTimeout(()=>saveProject(updated),1500);
      return updated;
    });
  }

  const STEPS=["Reading your transcript…","Reading documents…","Identifying deliverables…","Building concept pages…","Writing shot lists…","Almost ready…"];
  useEffect(()=>{if(screen!=="loading")return;let i=0;const t=setInterval(()=>{i=(i+1)%STEPS.length;setLoadMsg(STEPS[i]);},2000);return()=>clearInterval(t);},[screen]);

  async function generate(){
    const validDocs=docs.filter(d=>!d.error);
    if(!transcript.trim()&&validDocs.length===0)return;
    setErrMsg("");setScreen("loading");
    try{
      const userContent=[];
      for(const doc of validDocs.filter(d=>d.type==="pdf"))userContent.push({type:"document",source:{type:"base64",media_type:"application/pdf",data:doc.base64},title:doc.name});
      let prompt="Create a production brief. Return only JSON.\n\n";
      if(transcript.trim())prompt+=`MEETING NOTES:\n${transcript.trim()}\n\n`;
      for(const doc of validDocs.filter(d=>d.type==="text"))prompt+=`DOCUMENT (${doc.name}):\n${doc.content.slice(0,8000)}\n\n`;
      userContent.push({type:"text",text:prompt});
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","anthropic-dangerous-direct-browser-access":"true","x-api-key":API_KEY,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:MODEL,max_tokens:8000,system:SYSTEM_PROMPT,messages:[{role:"user",content:userContent}]})});
      const data=await res.json();
      if(!res.ok||data.error)throw new Error(data?.error?.message||`API error ${res.status}`);
      const raw=(data.content||[]).map(b=>b.text||"").join("").trim();
      if(!raw)throw new Error("Empty response");
      let jsonStr=raw;
      const fenced=raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if(fenced)jsonStr=fenced[1].trim();
      else{const s=raw.indexOf("{"),e=raw.lastIndexOf("}");if(s!==-1&&e!==-1)jsonStr=raw.slice(s,e+1);}
      jsonStr=jsonStr.replace(/,\s*}/g,"}").replace(/,\s*]/g,"]");
      const parsed=JSON.parse(jsonStr);
      if(!Array.isArray(parsed.concepts))parsed.concepts=[];
      if(!parsed.clientActionItems)parsed.clientActionItems=[];
      if(!parsed.internalTodos)parsed.internalTodos=[];
      const newProject={id:crypto.randomUUID(),user_id:user.id,title:parsed.projectTitle||"Untitled",client_name:parsed.clientName||"",status:"Draft",brief:parsed,doc_count:validDocs.length,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
      const saved=await saveProject(newProject);
      setActiveProject(saved||newProject);
      setPage("overview");setShareMode(false);setChatLog([]);setChatOpen(false);setDocs([]);setTranscript("");setScreen("doc");
    }catch(err){console.error(err);setErrMsg(err.message||"Something went wrong.");setScreen("input");}
  }

  async function sendChat(msg){
    if(!brief)return;
    const updatedLog=[...chatLog,{role:"user",content:msg}];
    setChatLog(updatedLog);setChatBusy(true);
    try{
      const system=`You are a creative director AI refining a production brief. You have full memory of this conversation. When the user requests changes, return the FULL updated brief JSON wrapped as BRIEF_START{...}BRIEF_END then write your reply. If the user shares a URL, add it to references or inspiration. Current brief:\n${JSON.stringify(brief)}`;
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","anthropic-dangerous-direct-browser-access":"true","x-api-key":API_KEY,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:MODEL,max_tokens:8000,system,messages:updatedLog})});
      const data=await res.json();
      const text=(data.content||[]).map(b=>b.text||"").join("");
      let reply=text;
      if(text.includes("BRIEF_START")){const m=text.match(/BRIEF_START([\s\S]*?)BRIEF_END/);if(m){try{setBrief(JSON.parse(m[1].trim()));}catch(e){console.error(e);}}reply=text.replace(/BRIEF_START[\s\S]*?BRIEF_END/,"").trim();}
      setChatLog(prev=>[...prev,{role:"assistant",content:reply||"Brief updated!"}]);
    }catch{setChatLog(prev=>[...prev,{role:"assistant",content:"Something went wrong — try again."}]);}
    finally{setChatBusy(false);}
  }

  function addConcept(){
    const blank={id:`c-${Date.now()}`,emoji:"🎬",title:"New Concept",type:"",logline:"",description:"",moodKeywords:[],inspiration:[],locations:[],lighting:{style:"",description:"",technical:""},colorHex:["#f5f0e8","#d4c5a9","#8b7355"],colorDescription:"",wardrobe:[],wardrobeNotes:"",props:[],shotList:[],script:{hook:"",act1:"",act2:"",act3:"",cta:""},deliverableFormat:"",directorNotes:""};
    const idx=arr(brief?.concepts).length;
    setBrief(b=>({...b,concepts:[...(b.concepts||[]),blank]}));
    setPage(`concept-${idx}`);setSidebarOpen(false);
  }

  const conceptIdx=page.startsWith("concept-")?parseInt(page.replace("concept-","")):-1;
  const canGenerate=transcript.trim()||docs.filter(d=>!d.error).length>0;

  function SidebarContent(){
    return(<>
      <button onClick={()=>setSidebarOpen(false)} style={{display:"flex",alignItems:"center",gap:6,width:"100%",padding:"10px 14px",border:"none",background:"none",cursor:"pointer",fontSize:13,color:"#9b9a97",fontFamily:"'Lora',serif",borderBottom:"1px solid #f1f0ef",marginBottom:8}}>← Close Menu</button>
      <div style={{fontSize:10,fontFamily:"'IBM Plex Mono',monospace",color:"#c4c3bf",textTransform:"uppercase",letterSpacing:"0.1em",padding:"0 10px",marginBottom:4}}>Project</div>
      <button className={`nb ${page==="overview"?"on":""}`} onClick={()=>{setPage("overview");setSidebarOpen(false);}}><span style={{fontSize:15,flexShrink:0}}>📁</span><span>Overview</span></button>
      <div style={{fontSize:10,fontFamily:"'IBM Plex Mono',monospace",color:"#c4c3bf",textTransform:"uppercase",letterSpacing:"0.1em",padding:"14px 10px 4px"}}>Concepts</div>
      {arr(brief?.concepts).map((c,i)=>(<button key={i} className={`nb ${page===`concept-${i}`?"on":""}`} onClick={()=>{setPage(`concept-${i}`);setSidebarOpen(false);}}><span style={{fontSize:15,flexShrink:0}}>{c.emoji||"🎬"}</span><span style={{overflow:"hidden",textOverflow:"ellipsis"}}>{c.title||`Concept ${i+1}`}</span></button>))}
      <button onClick={addConcept} style={{display:"flex",alignItems:"center",gap:6,width:"100%",padding:"6px 10px",border:"none",background:"none",cursor:"pointer",fontSize:12,color:"#9b9a97",fontFamily:"'Lora',serif",marginTop:6,borderRadius:6}} onMouseEnter={e=>e.currentTarget.style.color="#37352f"} onMouseLeave={e=>e.currentTarget.style.color="#9b9a97"}>+ Add Concept</button>
      {((brief?.clientActionItems?.length||0)+(brief?.internalTodos?.length||0))>0&&(<div style={{marginTop:16,padding:"12px 10px",borderTop:"1px solid #f1f0ef"}}><div style={{fontSize:10,fontFamily:"'IBM Plex Mono',monospace",color:"#c4c3bf",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8}}>Progress</div>{brief.clientActionItems?.length>0&&(<div style={{marginBottom:6}}><div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#9b9a97",marginBottom:3}}><span>✅ Client</span><span>{arr(brief.clientActionItems).filter(t=>t.done).length}/{arr(brief.clientActionItems).length}</span></div><div style={{height:4,background:"#f1f0ef",borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",background:"#1e7e34",width:`${(arr(brief.clientActionItems).filter(t=>t.done).length/arr(brief.clientActionItems).length)*100}%`,transition:"width .3s"}}/></div></div>)}{brief.internalTodos?.length>0&&(<div><div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#9b9a97",marginBottom:3}}><span>🔒 Team</span><span>{arr(brief.internalTodos).filter(t=>t.done).length}/{arr(brief.internalTodos).length}</span></div><div style={{height:4,background:"#f1f0ef",borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",background:"#e97942",width:`${(arr(brief.internalTodos).filter(t=>t.done).length/arr(brief.internalTodos).length)*100}%`,transition:"width .3s"}}/></div></div>)}</div>)}
    </>);
  }

  const CSS=`
    @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;0,700;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap');
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
    html,body,#root{height:100%;font-family:'Lora',Georgia,serif;background:#fff;color:#37352f;}
    textarea,input{font-family:'Lora',Georgia,serif;}
    ::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:#e0ddd8;border-radius:4px;}
    .spin{animation:spin 1s linear infinite;}@keyframes spin{to{transform:rotate(360deg);}}
    @keyframes pulse{0%,100%{opacity:1;}50%{opacity:0.4;}}
    @keyframes bounce{0%,80%,100%{transform:translateY(0);}40%{transform:translateY(-6px);}}
    .nb{display:flex;align-items:center;gap:8px;width:100%;padding:8px 10px;border:none;background:transparent;border-radius:6px;cursor:pointer;font-size:14px;color:#37352f;text-align:left;font-family:'Lora',serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:background .1s;}
    .nb:hover{background:#f1f0ef;}.nb.on{background:#e8f0fe;color:#1a56c4;font-weight:700;}
    .tbtn{border:1px solid #e8e4dc;padding:7px 14px;border-radius:6px;font-size:12px;color:#9b9a97;background:transparent;cursor:pointer;font-family:'Lora',serif;transition:all .15s;white-space:nowrap;}
    .tbtn:hover{border-color:#37352f;color:#37352f;}.tbtn.on{background:#37352f;color:#fff;border-color:#37352f;}
    .sidebar-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:200;}
    .sidebar-drawer{position:fixed;top:0;left:0;bottom:0;width:85%;max-width:320px;background:#fafaf9;z-index:201;transform:translateX(-100%);transition:transform .25s ease;overflow-y:auto;padding:16px 12px;border-right:1px solid #f1f0ef;}
    .mobile-only{display:none;}
    @media(max-width:768px){.sidebar-overlay.show{display:block;}.sidebar-drawer.show{transform:translateX(0);}.desktop-sidebar{display:none !important;}.mobile-only{display:flex !important;}.hide-on-mobile{display:none !important;}}
    @media(min-width:769px){.mobile-hamburger{display:none !important;}}
  `;

  if(authLoading)return(<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}><style>{CSS}</style><div className="spin" style={{width:28,height:28,border:"2px solid #f1f0ef",borderTop:"2px solid #37352f",borderRadius:"50%"}}/></div>);
  if(!user)return(<div><style>{CSS}</style><AuthScreen/></div>);

  if(screen==="doc"&&shareMode&&activeProject)return(
    <div style={{height:"100vh",display:"flex",flexDirection:"column",overflow:"hidden",background:"#fff"}}><style>{CSS}</style>
      <div style={{borderBottom:"1px solid #f1f0ef",padding:"12px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:10,overflow:"hidden"}}><span style={{fontSize:16}}>{brief?.coverEmoji||"🎬"}</span><span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:11,color:"#9b9a97",letterSpacing:"0.08em"}}>FRAME BRIEF</span><span style={{color:"#e8e4dc"}}>·</span><span style={{fontSize:13,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{brief?.projectTitle}</span><span style={{fontSize:11,background:"#e6f4ea",color:"#1e7e34",borderRadius:20,padding:"2px 8px",fontWeight:600,flexShrink:0}}>Client View</span></div>
        <button onClick={()=>setShareMode(false)} style={{border:"1px solid #e8e4dc",padding:"6px 14px",borderRadius:6,fontSize:12,color:"#9b9a97",background:"transparent",cursor:"pointer",fontFamily:"'Lora',serif",flexShrink:0}}>← Edit</button>
      </div>
      <div style={{display:"flex",flex:1,overflow:"hidden"}}>
        <div style={{width:220,borderRight:"1px solid #f1f0ef",padding:"16px 10px",overflowY:"auto",background:"#fafaf9",flexShrink:0}} className="hide-on-mobile">
          <button className={`nb ${page==="overview"?"on":""}`} onClick={()=>setPage("overview")}><span style={{fontSize:15}}>📁</span><span>Overview</span></button>
          {arr(brief?.concepts).map((c,i)=><button key={i} className={`nb ${page===`concept-${i}`?"on":""}`} onClick={()=>setPage(`concept-${i}`)}><span style={{fontSize:15}}>{c.emoji}</span><span style={{overflow:"hidden",textOverflow:"ellipsis"}}>{c.title}</span></button>)}
        </div>
        <div style={{flex:1,overflowY:"auto"}}>
          {page==="overview"&&<OverviewPage brief={brief} setBrief={()=>{}} goTo={setPage} readonly/>}
          {conceptIdx>=0&&brief?.concepts?.[conceptIdx]&&<ConceptPage key={conceptIdx} concept={brief.concepts[conceptIdx]} onChange={()=>{}} readonly/>}
        </div>
      </div>
    </div>
  );

  if(screen==="ideas")return(<div><style>{CSS}</style><IdeaCapture user={user} onBack={()=>setScreen("dashboard")}/></div>);

  if(screen==="dashboard")return(<div><style>{CSS}</style><Dashboard projects={projects} user={user} onOpen={p=>{setActiveProject(p);setPage("overview");setShareMode(false);setChatLog([]);setChatOpen(false);setSidebarOpen(false);setScreen("doc");}} onNew={()=>{setTranscript("");setDocs([]);setErrMsg("");setScreen("input");}} onDelete={deleteProject} onStatusChange={updateStatus} onSignOut={()=>supabase.auth.signOut()} onIdeas={()=>setScreen("ideas")}/></div>);

  if(screen==="input")return(
    <div style={{minHeight:"100vh",background:"#fff"}}><style>{CSS}</style>
      <div style={{maxWidth:660,margin:"0 auto",padding:"36px 20px 80px"}}>
        <button onClick={()=>setScreen("dashboard")} style={{background:"none",border:"none",color:"#9b9a97",fontSize:13,cursor:"pointer",fontFamily:"'Lora',serif",marginBottom:36,display:"flex",alignItems:"center",gap:6}}>← All Projects</button>
        <div style={{textAlign:"center",marginBottom:36}}><div style={{fontSize:44,marginBottom:10}}>🎬</div><h1 style={{fontSize:32,fontWeight:700,color:"#37352f",letterSpacing:"-0.02em",marginBottom:10}}>New Brief</h1><p style={{color:"#9b9a97",fontSize:14,fontStyle:"italic",lineHeight:1.6}}>Paste your meeting notes or send a bot to your live meeting.</p></div>
        <MeetingBotPanel projectId={null} onBotStarted={(botId)=>{
          const newProject={id:crypto.randomUUID(),user_id:user.id,title:"Meeting in progress…",client_name:"",status:"Draft",brief:{projectTitle:"Meeting in progress…",concepts:[],clientActionItems:[],internalTodos:[]},doc_count:0,recall_bot_id:botId,recall_status:"bot_joined",created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
          saveProject(newProject).then(saved=>{setActiveProject(saved||newProject);setPage("overview");setScreen("doc");});
        }} recallStatus={null}/>
        <div style={{display:"flex",alignItems:"center",gap:12,margin:"20px 0"}}><div style={{flex:1,height:1,background:"#f1f0ef"}}/><span style={{fontSize:12,color:"#c4c3bf"}}>or paste notes manually</span><div style={{flex:1,height:1,background:"#f1f0ef"}}/></div>
        {errMsg&&<div style={{background:"#fff2f2",border:"1px solid #ffc9c9",borderRadius:8,padding:"12px 16px",marginBottom:16,fontSize:13,color:"#c0392b",lineHeight:1.65}}><strong>Error:</strong> {errMsg}</div>}
        <div style={{border:`1px solid ${transcript.length>=HARD_LIMIT?"#ffc9c9":transcript.length>STANDARD_LIMIT?"#fde8c8":"#e8e4dc"}`,borderRadius:10,padding:"20px",marginBottom:14,background:"#fafaf9"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",letterSpacing:"0.08em",textTransform:"uppercase"}}>Meeting Notes or Transcript</div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>{transcript.length>STANDARD_LIMIT&&transcript.length<HARD_LIMIT&&<span style={{fontSize:11,background:"#fef3e2",color:"#b45309",borderRadius:20,padding:"2px 8px",fontWeight:600}}>Extended · Pro</span>}{transcript.length>=HARD_LIMIT&&<span style={{fontSize:11,background:"#fff2f2",color:"#c0392b",borderRadius:20,padding:"2px 8px",fontWeight:600}}>Limit reached</span>}<span style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:transcript.length>=HARD_LIMIT?"#c0392b":transcript.length>STANDARD_LIMIT?"#b45309":"#c4c3bf"}}>{transcript.length.toLocaleString()} / {STANDARD_LIMIT.toLocaleString()}</span></div>
          </div>
          <textarea rows={10} value={transcript} onChange={e=>{if(e.target.value.length<=HARD_LIMIT)setTranscript(e.target.value);}} placeholder={"Paste your client meeting notes or transcript here…\n\nDescribe every deliverable — each one becomes its own concept page."} style={{width:"100%",border:"none",outline:"none",resize:"none",background:"transparent",fontSize:14,lineHeight:1.8,color:"#37352f"}}/>
          <div style={{display:"flex",justifyContent:"flex-end",marginTop:8}}>
            <VoiceMicBtn onTranscript={(final, interim)=>{const combined=(final+(interim?" "+interim:"")).trim();if(combined.length<=HARD_LIMIT)setTranscript(combined);}}/>
          </div>
          {transcript.length>STANDARD_LIMIT&&transcript.length<HARD_LIMIT&&<div style={{marginTop:10,padding:"10px 14px",background:"#fef3e2",borderRadius:6,fontSize:12,color:"#92400e",lineHeight:1.65}}>⚡ <strong>Extended transcript</strong> — over standard limit (~30-min meeting). Pro plan required in full product.</div>}
          {transcript.length>=HARD_LIMIT&&<div style={{marginTop:10,padding:"10px 14px",background:"#fff2f2",borderRadius:6,fontSize:12,color:"#991b1b",lineHeight:1.65}}>🚫 <strong>Limit reached</strong> — max {HARD_LIMIT.toLocaleString()} characters (~60-min meeting).</div>}
        </div>
        <div style={{border:"1px solid #e8e4dc",borderRadius:10,padding:"20px",marginBottom:18,background:"#fafaf9"}}><DocUpload docs={docs} onAdd={r=>setDocs(prev=>[...prev,...r])} onRemove={i=>setDocs(prev=>prev.filter((_,j)=>j!==i))}/></div>
        <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
          <button onClick={generate} disabled={!canGenerate} style={{background:"#37352f",color:"#fff",border:"none",padding:"12px 28px",borderRadius:6,fontFamily:"'Lora',serif",fontSize:14,cursor:canGenerate?"pointer":"not-allowed",opacity:canGenerate?1:0.45}}>Generate Brief →</button>
          <button onClick={()=>{setTranscript(SAMPLE);setErrMsg("");}} style={{background:"transparent",color:"#9b9a97",border:"1px solid #e8e4dc",padding:"11px 18px",borderRadius:6,fontFamily:"'Lora',serif",fontSize:13,cursor:"pointer"}} onMouseEnter={e=>{e.currentTarget.style.borderColor="#37352f";e.currentTarget.style.color="#37352f";}} onMouseLeave={e=>{e.currentTarget.style.borderColor="#e8e4dc";e.currentTarget.style.color="#9b9a97";}}>Load Sample</button>
        </div>
      </div>
    </div>
  );

  if(screen==="loading")return(<div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:18}}><style>{CSS}</style><div className="spin" style={{width:28,height:28,border:"2px solid #f1f0ef",borderTop:"2px solid #37352f",borderRadius:"50%"}}/><p style={{color:"#9b9a97",fontStyle:"italic",fontSize:15}}>{loadMsg}</p></div>);

  if(screen==="doc"&&brief)return(
    <div style={{height:"100vh",display:"flex",flexDirection:"column",overflow:"hidden"}}><style>{CSS}</style>
      <div className={`sidebar-overlay ${sidebarOpen?"show":""}`} onClick={()=>setSidebarOpen(false)} style={{display:"none"}}/>
      <div style={{borderBottom:"1px solid #f1f0ef",padding:"10px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",background:"rgba(255,255,255,0.97)",backdropFilter:"blur(10px)",flexShrink:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:8,overflow:"hidden",minWidth:0}}>
          <button onClick={()=>setSidebarOpen(true)} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",padding:"2px 6px",color:"#37352f",flexShrink:0}}>☰</button>
          <button onClick={()=>setScreen("dashboard")} style={{background:"none",border:"none",color:"#9b9a97",cursor:"pointer",fontSize:13,fontFamily:"'Lora',serif",display:"flex",alignItems:"center",gap:4,flexShrink:0}}>← Projects</button>
          <span style={{color:"#e8e4dc",flexShrink:0}}>·</span>
          <span style={{fontSize:13,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{brief.projectTitle}</span>
          <span className="hide-on-mobile"><StatusBadge status={activeProject.status} onChange={s=>updateStatus(activeProject.id,s)}/></span>
          {dbSaving&&<span style={{fontSize:11,color:"#c4c3bf",fontStyle:"italic",flexShrink:0}}>Saving…</span>}
        </div>
        <div style={{display:"flex",gap:6,flexShrink:0}}>
          <button className="tbtn" onClick={()=>{navigator.clipboard.writeText(window.location.href).catch(()=>{});setCopied(true);setTimeout(()=>setCopied(false),2000);}}>{copied?"✓ Copied!":"🔗 Share"}</button>
          <button className="tbtn" onClick={()=>setShareMode(true)}>👁 Client</button>
          <button className={`tbtn ${chatOpen?"on":""}`} onClick={()=>setChatOpen(o=>!o)}>{chatOpen?"✕ AI":"✦ AI"}</button>
        </div>
      </div>
      <div style={{display:"flex",flex:1,overflow:"hidden"}}>
        {sidebarOpen&&<div style={{width:220,borderRight:"1px solid #f1f0ef",padding:"16px 10px",overflowY:"auto",background:"#fafaf9",flexShrink:0,display:"flex",flexDirection:"column"}}>{SidebarContent()}</div>}
        <div style={{flex:1,overflowY:"auto"}}>
          {page==="overview"&&<OverviewPage brief={brief} setBrief={setBrief} goTo={p=>{setPage(p);setSidebarOpen(false);}}/>}
          {conceptIdx>=0&&brief.concepts?.[conceptIdx]&&<ConceptPage key={conceptIdx} concept={brief.concepts[conceptIdx]} onChange={val=>setBrief(b=>{const c=[...(b.concepts||[])];c[conceptIdx]=val;return{...b,concepts:c};})}/>}
        </div>
        {chatOpen&&<div style={{width:340,borderLeft:"1px solid #f1f0ef",display:"flex",flexDirection:"column",flexShrink:0,overflow:"hidden"}} className="hide-on-mobile"><AIChatPanel chatLog={chatLog} onSend={sendChat} busy={chatBusy} onClose={()=>setChatOpen(false)}/></div>}
      </div>
      {chatOpen&&<div className="mobile-only" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:250,flexDirection:"column",justifyContent:"flex-end"}}><div style={{background:"#fff",borderRadius:"16px 16px 0 0",height:"80vh",display:"flex",flexDirection:"column",overflow:"hidden"}}><div style={{padding:"12px 16px",borderBottom:"1px solid #f1f0ef",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}><span style={{fontWeight:700,fontSize:14}}>✦ AI Creative Director</span><button onClick={()=>setChatOpen(false)} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#9b9a97"}}>✕</button></div><div style={{flex:1,overflow:"hidden"}}><AIChatPanel chatLog={chatLog} onSend={sendChat} busy={chatBusy} onClose={()=>setChatOpen(false)}/></div></div></div>}
    </div>
  );

  return null;
}

export default function FrameBrief() {
  return <ErrorBoundary><FrameBriefApp /></ErrorBoundary>;
}
