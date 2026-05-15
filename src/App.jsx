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
{"coverEmoji":"🎬","projectTitle":"","clientName":"","projectType":"","date":"","timeline":"","budget":"","logline":"","overview":"","moodKeywords":[],"moodDescription":"","references":[],"overallLocations":[{"name":"","address":"","description":""}],"overallWardrobe":[],"overallProps":[],"generalNotes":"","clientActionItems":[{"id":"ca-1","text":"","done":false}],"internalTodos":[{"id":"it-1","text":"","done":false}],"concepts":[{"id":"concept-1","emoji":"🎥","title":"","type":"","logline":"","description":"","moodKeywords":[],"inspiration":[],"locations":[{"name":"","vibe":"","address":"","description":"","shots":""}],"lighting":{"style":"","description":"","technical":""},"colorHex":["#c8a97e","#3d2b1f","#f5ede0"],"colorDescription":"","wardrobe":[],"wardrobeNotes":"","props":[],"shotList":[{"number":"01","type":"","description":"","lens":"","notes":""}],"script":{"hook":"","act1":"","act2":"","act3":"","cta":""},"deliverableFormat":"","directorNotes":"","hooks":[],"selectedHook":""}]}`;

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
        <button onClick={() => { this.setState({ error: null }); window.location.reload(); }}
          style={{ background:"#37352f", color:"#fff", border:"none", padding:"10px 24px", borderRadius:6, fontSize:14, cursor:"pointer", fontFamily:"inherit" }}>
          Reload
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

// ─── SHARED IDEA VIEW (read-only) ────────────────────────────────────────────
function SharedIdeaView({idea}){
  const brief=idea?.brief;
  if(!idea)return null;
  const Row=({label,value})=>value?<div style={{marginBottom:6}}><span style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.06em"}}>{label}: </span><span style={{fontSize:13,color:"#37352f",fontWeight:600}}>{value}</span></div>:null;
  return(
    <div style={{minHeight:"100vh",background:"#fff",display:"flex",flexDirection:"column"}}>
      <div style={{borderBottom:"1px solid #f1f0ef",padding:"12px 20px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
        <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:11,color:"#9b9a97",letterSpacing:"0.08em"}}>FRAME BRIEF</span>
        <span style={{color:"#e8e4dc"}}>·</span>
        <span style={{fontSize:13,fontWeight:700,color:"#37352f",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{brief?.title||"Idea Brief"}</span>
        <span style={{fontSize:11,background:"#e6f4ea",color:"#1e7e34",borderRadius:20,padding:"2px 8px",fontWeight:600,flexShrink:0}}>View Only</span>
      </div>
      <div style={{flex:1,overflowY:"auto",maxWidth:760,width:"100%",margin:"0 auto",padding:"40px 24px 100px"}}>
        {idea.rawText&&<div style={{background:"#f7f6f3",borderLeft:"3px solid #e97942",padding:"14px 18px",borderRadius:"0 8px 8px 0",marginBottom:28,fontSize:14,color:"#55534e",lineHeight:1.7,fontStyle:"italic"}}><div style={{fontSize:10,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>Original Idea</div>{idea.rawText}</div>}
        {brief&&<>
          <h1 style={{fontSize:30,fontWeight:700,color:"#37352f",letterSpacing:"-0.02em",marginBottom:6,lineHeight:1.2}}>{brief.title||"Untitled Idea"}</h1>
          <div style={{fontSize:15,color:"#9b9a97",fontStyle:"italic",marginBottom:12,lineHeight:1.6}}>{brief.logline}</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:24}}>
            {[["Format",brief.format],["Audience",brief.targetAudience],["Est. Length",brief.estimatedLength]].filter(([,v])=>v).map(([l,v])=><div key={l} style={{background:"#f1f0ef",borderRadius:6,padding:"4px 10px"}}><span style={{fontSize:10,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.06em"}}>{l}: </span><span style={{fontSize:12,color:"#37352f",fontWeight:600}}>{v}</span></div>)}
          </div>
          {(brief.hook||brief.angle)&&<><HR/><Section emoji="🎣" title="Hook & Angle">{brief.hook&&<div style={{marginBottom:10}}><div style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>Hook</div><div style={{fontSize:14,lineHeight:1.8,background:"#fafaf9",borderRadius:6,padding:"10px 14px"}}>{brief.hook}</div></div>}{brief.angle&&<div><div style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>Angle / Perspective</div><div style={{fontSize:14,lineHeight:1.8,background:"#fafaf9",borderRadius:6,padding:"10px 14px"}}>{brief.angle}</div></div>}</Section></>}
          {arr(brief.outline).length>0&&<><HR/><Section emoji="📋" title="Content Outline">{arr(brief.outline).map((act,i)=><div key={i} style={{background:"#f9f8f6",borderLeft:"3px solid #e8e4dc",padding:"12px 16px",borderRadius:"0 8px 8px 0",marginBottom:10}}><div style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4}}>{act.act}</div><div style={{fontSize:14,lineHeight:1.75}}>{act.description}</div></div>)}</Section></>}
          {arr(brief.keyPoints).length>0&&<><HR/><Section emoji="💬" title="Key Points to Hit">{arr(brief.keyPoints).map((pt,i)=><div key={i} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"5px 0"}}><span style={{color:"#e97942",marginTop:4}}>→</span><div style={{flex:1,fontSize:14}}>{pt}</div></div>)}</Section></>}
          {brief.scriptNotes&&<><HR/><Section emoji="📝" title="Script Notes"><div style={{fontSize:14,lineHeight:1.85,background:"#fafaf9",borderRadius:6,padding:"12px 16px"}}>{brief.scriptNotes}</div></Section></>}
          {arr(brief.locations).length>0&&<><HR/><Section emoji="📍" title="Locations">{arr(brief.locations).map((loc,i)=><div key={i} style={{background:"#f7f6f3",borderRadius:8,padding:"12px 14px",marginBottom:8,border:"1px solid #eeece8"}}><div style={{fontWeight:700,fontSize:14,marginBottom:4}}>{loc.name}</div>{loc.notes&&<div style={{fontSize:13,color:"#55534e"}}>{loc.notes}</div>}</div>)}</Section></>}
          {arr(brief.props).length>0&&<><HR/><Section emoji="🎪" title="Props & Equipment">{arr(brief.props).map((p,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"5px 0"}}><span style={{color:"#9b9a97"}}>·</span><div style={{flex:1,fontSize:14}}>{p}</div></div>)}</Section></>}
          {arr(brief.shotList).length>0&&<><HR/><Section emoji="🎥" title="Shot List"><div style={{overflowX:"auto"}}><div style={{display:"grid",gridTemplateColumns:"36px 80px 1fr",gap:8,padding:"6px 0",borderBottom:"1px solid #e8e4dc",minWidth:280}}>{["#","Type","Description"].map(h=><div key={h} style={{fontSize:10,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.06em"}}>{h}</div>)}</div>{arr(brief.shotList).map((shot,i)=><div key={i} style={{display:"grid",gridTemplateColumns:"36px 80px 1fr",gap:8,alignItems:"start",padding:"9px 0",borderBottom:"1px solid #f7f6f3",minWidth:280}}><div style={{fontSize:11,fontWeight:700,color:"#9b9a97",paddingTop:4}}>{shot.number||String(i+1).padStart(2,"0")}</div><div style={{fontSize:12,fontWeight:600,color:"#e97942"}}>{shot.type}</div><div style={{fontSize:13,lineHeight:1.6}}>{shot.description}</div></div>)}</div></Section></>}
          {arr(brief.tags).length>0&&<><HR/><Section emoji="🏷" title="Tags" defaultOpen={false}><div style={{display:"flex",flexWrap:"wrap",gap:6}}>{arr(brief.tags).map((tag,i)=><span key={i} style={{background:"#f1f0ef",color:"#55534e",borderRadius:20,padding:"3px 12px",fontSize:12,fontWeight:500}}>{tag}</span>)}</div></Section></>}
        </>}
      </div>
    </div>
  );
}

// ─── IDEA PAGE (expanded view) ────────────────────────────────────────────────
function IdeaPage({ idea, onBack, onUpdate, user, projects, onLinkProject, onUnlinkProject }) {
  const [localIdea, setLocalIdea] = useState(idea);
  const [shareState, setShareState] = useState("idle");
  const [chatLog, setChatLog] = useState([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [hooksBusy, setHooksBusy] = useState(false);
  const [hooksErr, setHooksErr] = useState("");
  const [showLinkPicker, setShowLinkPicker] = useState(false);
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

  async function handleShare(){
    if(!user||!brief)return;
    setShareState("saving");
    try{
      let shareId=localIdea.shareId;
      if(shareId){
        await supabase.from("shared_ideas").update({idea:localIdea,title:brief.title||"Untitled",updated_at:new Date().toISOString()}).eq("id",shareId);
      } else {
        const{data}=await supabase.from("shared_ideas").insert({user_id:user.id,idea:localIdea,title:brief.title||"Untitled"}).select().single();
        shareId=data?.id;
        if(shareId){const updated={...localIdea,shareId};setLocalIdea(updated);onUpdate(updated);}
      }
      if(shareId){navigator.clipboard.writeText(`${window.location.origin}/idea/${shareId}`).catch(()=>{});setShareState("copied");setTimeout(()=>setShareState("idle"),2500);}
      else setShareState("idle");
    }catch{setShareState("idle");}
  }

  async function generateHooks(append){
    setHooksBusy(true);setHooksErr("");
    try{
      const res=await fetch("/api/generate-hooks",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({concept:{title:brief.title,logline:brief.logline,hook:brief.hook,angle:brief.angle,keyPoints:brief.keyPoints,moodKeywords:brief.tags}})});
      const data=await res.json();
      if(data.hooks){const existing=append?arr(brief.hooks):[];set("hooks",[...existing,...data.hooks]);}
      else setHooksErr("Generation failed. Try again.");
    }catch{setHooksErr("Network error.");}
    setHooksBusy(false);
  }

  async function sendIdeaChat(msg){
    const updatedLog=[...chatLog,{role:"user",content:msg}];
    setChatLog(updatedLog);setChatBusy(true);
    try{
      const epList=arr(brief.concepts).map((c,i)=>`#${i+1}: "${c.title}" (id: ${c.id})`).join(", ");
      const system=`You are a creative director AI actively editing an idea brief. Full conversation history is maintained.
${epList?`Episodes in this series: ${epList}`:""}

RESPONSE FORMAT — return ONLY a valid JSON object, no markdown, no extra text:
{"message":"Your 1-2 sentence reply","briefUpdate":null}
When making edits:
{"message":"Done! I updated X.","briefUpdate":{"fieldName":"newValue"}}

EDITING RULES:
- briefUpdate contains ONLY changed fields (partial update)
- For episode changes: include only changed episodes in "concepts" array with full updated data, merged by id
- Keep message brief (1-2 sentences)
- You can ALWAYS edit — never say you can't

FIELD SCHEMAS:
- outline: [{"act":"","description":""}]
- keyPoints / props / tags / hooks: ["string"]
- locations: [{"name":"","notes":""}]
- shotList: [{"number":"01","type":"","description":""}]
- toDoList: [{"text":"","done":false}]
- concepts (episodes): [{"id":"","title":"","hook":"","angle":"","outline":[...],"keyPoints":[...],"scriptNotes":"","locations":[...],"shotList":[...],"hooks":[]}]

Current brief:
${JSON.stringify(brief)}`;
      const apiMessages=updatedLog.filter(m=>m.role==="user"||m.role==="assistant");
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","anthropic-dangerous-direct-browser-access":"true","x-api-key":API_KEY,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:MODEL,max_tokens:4000,system,messages:apiMessages})});
      const data=await res.json();
      const text=(data.content||[]).map(b=>b.text||"").join("").trim();
      let parsed=null;
      try{const s=text.indexOf("{"),e=text.lastIndexOf("}");if(s!==-1&&e!==-1)parsed=JSON.parse(text.slice(s,e+1));}catch{}
      const reply=parsed?.message||text;
      const update=parsed?.briefUpdate;
      if(update&&typeof update==="object"){
        const merged={...brief,...update};
        if(update.concepts&&Array.isArray(update.concepts)&&Array.isArray(brief.concepts)){
          const byId={};update.concepts.forEach(c=>{if(c.id)byId[c.id]=c;});
          merged.concepts=brief.concepts.map(c=>byId[c.id]?{...c,...byId[c.id]}:c);
          update.concepts.forEach(c=>{if(c.id&&!brief.concepts.find(p=>p.id===c.id))merged.concepts.push(c);});
        }
        const updated={...localIdea,brief:merged};
        setLocalIdea(updated);onUpdate(updated);
        setChatLog([...updatedLog,{role:"assistant",content:reply},{role:"system",content:"✓ Brief updated"}]);
      }else{
        setChatLog([...updatedLog,{role:"assistant",content:reply}]);
      }
    }catch(err){console.error(err);setChatLog(prev=>[...prev,{role:"assistant",content:"Something went wrong — try again."}]);}
    finally{setChatBusy(false);}
  }

  function addEpisode(){
    addArr("concepts",{id:`ep-${Date.now()}`,title:`Episode ${arr(brief.concepts).length+1}`,hook:"",angle:"",outline:[],keyPoints:[],scriptNotes:"",locations:[],props:[],shotList:[],hooks:[],selectedHook:""});
  }

  // Episode field helpers
  const upEp=(ei,k,v)=>{const c=[...arr(brief.concepts)];c[ei]={...c[ei],[k]:v};set("concepts",c);};
  const upEpArr=(ei,k,i,v)=>{const c=[...arr(brief.concepts)];const a=[...arr(c[ei][k])];a[i]=v;c[ei]={...c[ei],[k]:a};set("concepts",c);};
  const delEpArr=(ei,k,i)=>{const c=[...arr(brief.concepts)];c[ei]={...c[ei],[k]:arr(c[ei][k]).filter((_,j)=>j!==i)};set("concepts",c);};
  const addEpArr=(ei,k,item)=>{const c=[...arr(brief.concepts)];c[ei]={...c[ei],[k]:[...arr(c[ei][k]),item]};set("concepts",c);};

  return (
    <div style={{minHeight:"100vh",background:"#fff",display:"flex",flexDirection:"column"}}>
      {/* Header */}
      <div style={{borderBottom:"1px solid #f1f0ef",padding:"12px 20px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:"#9b9a97",cursor:"pointer",fontSize:13,fontFamily:"'Lora',serif",display:"flex",alignItems:"center",gap:4,flexShrink:0}}>← Ideas</button>
        <span style={{color:"#e8e4dc",flexShrink:0}}>·</span>
        <span style={{fontSize:13,fontWeight:700,color:"#37352f",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{brief?.title||localIdea.rawText?.slice(0,40)}</span>
        {user&&brief&&(localIdea.linkedProjectId
          ? <div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
              <span style={{fontSize:11,background:"#e6f4ea",color:"#1e7e34",borderRadius:20,padding:"3px 10px",fontFamily:"'IBM Plex Mono',monospace",whiteSpace:"nowrap"}}>
                📁 {(projects||[]).find(p=>p.id===localIdea.linkedProjectId)?.title||"Linked"}
              </span>
              <button onClick={()=>{if(window.confirm("Remove from project?"))onUnlinkProject&&(setLocalIdea(prev=>({...prev,linkedProjectId:null})),onUnlinkProject());}} style={{background:"none",border:"none",color:"#9b9a97",cursor:"pointer",fontSize:12,padding:"2px 4px"}} title="Unlink">✕</button>
            </div>
          : <button onClick={()=>setShowLinkPicker(true)} className="tbtn" style={{flexShrink:0}}>📁 Link to Project</button>
        )}
        {user&&brief&&<button className={`tbtn${chatOpen?" on":""}`} onClick={()=>setChatOpen(o=>!o)} style={{flexShrink:0}}>{chatOpen?"✕ AI":"✦ AI"}</button>}
        {user&&brief&&<button onClick={handleShare} disabled={shareState==="saving"} style={{background:"none",border:"1px solid #e8e4dc",borderRadius:6,padding:"6px 12px",fontSize:12,color:shareState==="copied"?"#1e7e34":"#55534e",cursor:"pointer",fontFamily:"'Lora',serif",flexShrink:0,whiteSpace:"nowrap"}}>{shareState==="saving"?"Saving…":shareState==="copied"?"✓ Copied":"🔗 Share"}</button>}
        {showLinkPicker&&<ProjectPickerModal projects={projects||[]} onSelect={proj=>{setLocalIdea(prev=>({...prev,linkedProjectId:proj.id}));onLinkProject&&onLinkProject(proj);setShowLinkPicker(false);}} onClose={()=>setShowLinkPicker(false)}/>}
      </div>

      {/* Body */}
      <div style={{flex:1}}>
        {/* Main content */}
        <div style={{padding:"40px 24px 100px",transition:"padding-right .2s",paddingRight:chatOpen?364:24}}>
          <div style={{maxWidth:760,margin:"0 auto"}}>
            {/* Raw idea */}
            <div style={{background:"#f7f6f3",borderLeft:"3px solid #e97942",padding:"14px 18px",borderRadius:"0 8px 8px 0",marginBottom:28,fontSize:14,color:"#55534e",lineHeight:1.7,fontStyle:"italic"}}>
              <div style={{fontSize:10,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>Original Idea</div>
              {localIdea.rawText}
            </div>

            {!brief?(
              <div style={{textAlign:"center",padding:"40px 0",color:"#c4c3bf"}}>
                <div className="spin" style={{width:24,height:24,border:"2px solid #f1f0ef",borderTop:"2px solid #37352f",borderRadius:"50%",margin:"0 auto 12px"}}/>
                <p style={{fontSize:13,fontStyle:"italic"}}>Generating your creative brief…</p>
              </div>
            ):(
              <>
                <h1 style={{fontSize:30,fontWeight:700,color:"#37352f",letterSpacing:"-0.02em",marginBottom:6,lineHeight:1.2}}><Editable value={brief.title} onChange={v=>set("title",v)} placeholder="Untitled Idea"/></h1>
                <div style={{fontSize:15,color:"#9b9a97",fontStyle:"italic",marginBottom:8,lineHeight:1.6}}><Editable value={brief.logline} onChange={v=>set("logline",v)} placeholder="One-sentence pitch…"/></div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:24}}>
                  {[["Format","format"],["Audience","targetAudience"],["Est. Length","estimatedLength"]].map(([l,k])=>(
                    <div key={k} style={{background:"#f1f0ef",borderRadius:6,padding:"4px 10px"}}>
                      <span style={{fontSize:10,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.06em"}}>{l}: </span>
                      <span style={{fontSize:12,color:"#37352f",fontWeight:600}}><Editable value={brief[k]} onChange={v=>set(k,v)} placeholder="—"/></span>
                    </div>
                  ))}
                </div>

                <HR/>
                <Section emoji="🎣" title="Hook & Angle">
                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>Hook</div>
                    <div style={{fontSize:14,lineHeight:1.8,background:"#fafaf9",borderRadius:6,padding:"10px 14px"}}><Editable value={brief.hook} onChange={v=>set("hook",v)} multiline placeholder="What grabs attention in the first 3 seconds?"/></div>
                  </div>
                  <div>
                    <div style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>Angle / Perspective</div>
                    <div style={{fontSize:14,lineHeight:1.8,background:"#fafaf9",borderRadius:6,padding:"10px 14px"}}><Editable value={brief.angle} onChange={v=>set("angle",v)} multiline placeholder="What's the unique point of view?"/></div>
                  </div>
                </Section>
                <HR/>

                <Section emoji="💡" title="Hook Options" defaultOpen={arr(brief.hooks).length>0}>
                  {arr(brief.hooks).length===0?<><button onClick={()=>generateHooks(false)} disabled={hooksBusy} style={{background:"#f9f8f6",border:"1px dashed #e8e4dc",borderRadius:8,padding:"12px 20px",fontSize:13,color:hooksBusy?"#c4c3bf":"#55534e",cursor:hooksBusy?"wait":"pointer",fontFamily:"inherit",width:"100%",textAlign:"center"}}>{hooksBusy?"Generating…":"✦ Generate Hook Options"}</button>{hooksErr&&<div style={{fontSize:12,color:"#c0392b",marginTop:8}}>{hooksErr}</div>}</>:<>{arr(brief.hooks).map((hook,i)=>{const sel=brief.selectedHook===hook;return(<div key={i} onClick={()=>set("selectedHook",sel?"":hook)} style={{padding:"14px 16px",borderRadius:8,marginBottom:8,border:sel?"2px solid #e97942":"1px solid #eeece8",background:sel?"#fffbf7":"#f7f6f3",cursor:"pointer",position:"relative"}}>{sel&&<div style={{position:"absolute",top:10,right:12,fontSize:10,color:"#e97942",fontWeight:700,fontFamily:"'IBM Plex Mono',monospace",letterSpacing:"0.08em"}}>SELECTED</div>}<div style={{fontSize:14,lineHeight:1.65,color:"#37352f",paddingRight:sel?76:0}}><Editable value={hook} onChange={v=>upArr("hooks",i,v)}/></div><button onClick={e=>{e.stopPropagation();set("hooks",arr(brief.hooks).filter((_,j)=>j!==i));}} style={{position:"absolute",bottom:8,right:10,background:"none",border:"none",color:"#ccc",cursor:"pointer",fontSize:11}}>✕</button></div>);})} <div style={{display:"flex",gap:8,marginTop:8,flexWrap:"wrap"}}><button onClick={()=>generateHooks(true)} disabled={hooksBusy} style={{background:"none",border:"1px solid #e8e4dc",borderRadius:6,padding:"6px 14px",fontSize:12,color:hooksBusy?"#c4c3bf":"#55534e",cursor:hooksBusy?"wait":"pointer",fontFamily:"inherit"}}>{hooksBusy?"Generating…":"+ Generate More"}</button><button onClick={()=>addArr("hooks","Write your hook here…")} style={{background:"none",border:"1px solid #e8e4dc",borderRadius:6,padding:"6px 14px",fontSize:12,color:"#55534e",cursor:"pointer",fontFamily:"inherit"}}>+ Write Custom</button></div>{hooksErr&&<div style={{fontSize:12,color:"#c0392b",marginTop:6}}>{hooksErr}</div>}</>}
                </Section>
                <HR/>

                <Section emoji="📋" title="Content Outline">
                  {arr(brief.outline).map((act,i)=>(
                    <div key={i} style={{background:"#f9f8f6",borderLeft:"3px solid #e8e4dc",padding:"12px 16px",borderRadius:"0 8px 8px 0",marginBottom:10}}>
                      <div style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4}}><Editable value={act.act} onChange={v=>upArr("outline",i,{...act,act:v})} placeholder="Section name"/></div>
                      <div style={{fontSize:14,lineHeight:1.75}}><Editable value={act.description} onChange={v=>upArr("outline",i,{...act,description:v})} multiline placeholder="Describe this section…"/></div>
                    </div>
                  ))}
                  <button onClick={()=>addArr("outline",{act:"New Section",description:""})} style={{background:"none",border:"none",color:"#9b9a97",fontSize:13,cursor:"pointer",fontFamily:"inherit",padding:"4px 0"}} onMouseEnter={e=>e.currentTarget.style.color="#37352f"} onMouseLeave={e=>e.currentTarget.style.color="#9b9a97"}>+ Add section</button>
                </Section>
                <HR/>

                <Section emoji="💬" title="Key Points to Hit">
                  {arr(brief.keyPoints).map((pt,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"5px 0"}}>
                      <span style={{color:"#e97942",marginTop:4}}>→</span>
                      <div style={{flex:1,fontSize:14}}><Editable value={pt} onChange={v=>upArr("keyPoints",i,v)} placeholder="Key point…"/></div>
                      <button onClick={()=>delArr("keyPoints",i)} style={{background:"none",border:"none",color:"#ddd",cursor:"pointer",fontSize:13}} onMouseEnter={e=>e.currentTarget.style.color="#c0392b"} onMouseLeave={e=>e.currentTarget.style.color="#ddd"}>✕</button>
                    </div>
                  ))}
                  <button onClick={()=>addArr("keyPoints","New point")} style={{background:"none",border:"none",color:"#9b9a97",fontSize:13,cursor:"pointer",fontFamily:"inherit",padding:"4px 0"}} onMouseEnter={e=>e.currentTarget.style.color="#37352f"} onMouseLeave={e=>e.currentTarget.style.color="#9b9a97"}>+ Add point</button>
                </Section>
                <HR/>

                <Section emoji="📝" title="Script Notes">
                  <div style={{fontSize:14,lineHeight:1.85,background:"#fafaf9",borderRadius:6,padding:"12px 16px"}}><Editable value={brief.scriptNotes} onChange={v=>set("scriptNotes",v)} multiline placeholder="Tone, delivery notes, phrases to use or avoid…"/></div>
                </Section>
                <HR/>

                <Section emoji="📍" title="Locations">
                  {arr(brief.locations).map((loc,i)=>(
                    <div key={i} style={{background:"#f7f6f3",borderRadius:8,padding:"12px 14px",marginBottom:8,border:"1px solid #eeece8"}}>
                      <div style={{display:"flex",justifyContent:"space-between"}}>
                        <div style={{flex:1}}>
                          <div style={{fontWeight:700,fontSize:14,marginBottom:4}}><Editable value={loc.name} onChange={v=>upArr("locations",i,{...loc,name:v})} placeholder="Location name"/></div>
                          <div style={{fontSize:13,color:"#55534e"}}><Editable value={loc.notes} onChange={v=>upArr("locations",i,{...loc,notes:v})} multiline placeholder="Notes…"/></div>
                        </div>
                        <button onClick={()=>delArr("locations",i)} style={{background:"none",border:"none",color:"#ccc",cursor:"pointer",fontSize:13,marginLeft:8}} onMouseEnter={e=>e.currentTarget.style.color="#c0392b"} onMouseLeave={e=>e.currentTarget.style.color="#ccc"}>✕</button>
                      </div>
                    </div>
                  ))}
                  <button onClick={()=>addArr("locations",{name:"New Location",notes:""})} style={{background:"none",border:"none",color:"#9b9a97",fontSize:13,cursor:"pointer",fontFamily:"inherit",padding:"4px 0"}} onMouseEnter={e=>e.currentTarget.style.color="#37352f"} onMouseLeave={e=>e.currentTarget.style.color="#9b9a97"}>+ Add location</button>
                </Section>
                <HR/>

                <Section emoji="🎪" title="Props & Equipment">
                  {arr(brief.props).map((p,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"5px 0"}}>
                      <span style={{color:"#9b9a97"}}>·</span>
                      <div style={{flex:1,fontSize:14}}><Editable value={p} onChange={v=>upArr("props",i,v)}/></div>
                      <button onClick={()=>delArr("props",i)} style={{background:"none",border:"none",color:"#ddd",cursor:"pointer",fontSize:13}} onMouseEnter={e=>e.currentTarget.style.color="#c0392b"} onMouseLeave={e=>e.currentTarget.style.color="#ddd"}>✕</button>
                    </div>
                  ))}
                  <button onClick={()=>addArr("props","New item")} style={{background:"none",border:"none",color:"#9b9a97",fontSize:13,cursor:"pointer",fontFamily:"inherit",padding:"4px 0"}} onMouseEnter={e=>e.currentTarget.style.color="#37352f"} onMouseLeave={e=>e.currentTarget.style.color="#9b9a97"}>+ Add item</button>
                </Section>
                <HR/>

                <Section emoji="🎥" title="Shot List">
                  <div style={{overflowX:"auto"}}>
                    <div style={{display:"grid",gridTemplateColumns:"36px 80px 1fr 24px",gap:8,padding:"6px 0",borderBottom:"1px solid #e8e4dc",minWidth:320}}>
                      {["#","Type","Description",""].map((h,i)=><div key={i} style={{fontSize:10,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.06em"}}>{h}</div>)}
                    </div>
                    {arr(brief.shotList).map((shot,i)=>(
                      <div key={i} style={{display:"grid",gridTemplateColumns:"36px 80px 1fr 24px",gap:8,alignItems:"start",padding:"9px 0",borderBottom:"1px solid #f7f6f3",minWidth:320}}>
                        <div style={{fontSize:11,fontWeight:700,color:"#9b9a97",paddingTop:4}}>{shot.number||String(i+1).padStart(2,"0")}</div>
                        <div style={{fontSize:12,fontWeight:600,color:"#e97942"}}><Editable value={shot.type} onChange={v=>upArr("shotList",i,{...shot,type:v})} placeholder="Type"/></div>
                        <div style={{fontSize:13,lineHeight:1.6}}><Editable value={shot.description} onChange={v=>upArr("shotList",i,{...shot,description:v})} multiline placeholder="Describe the shot…"/></div>
                        <button onClick={()=>delArr("shotList",i)} style={{background:"none",border:"none",color:"#ccc",cursor:"pointer",fontSize:13,paddingTop:4}} onMouseEnter={e=>e.currentTarget.style.color="#c0392b"} onMouseLeave={e=>e.currentTarget.style.color="#ccc"}>✕</button>
                      </div>
                    ))}
                  </div>
                  <button onClick={()=>addArr("shotList",{number:String((arr(brief.shotList).length)+1).padStart(2,"0"),type:"B-Roll",description:""})} style={{background:"none",border:"none",color:"#9b9a97",fontSize:13,cursor:"pointer",fontFamily:"inherit",padding:"4px 0",marginTop:8}} onMouseEnter={e=>e.currentTarget.style.color="#37352f"} onMouseLeave={e=>e.currentTarget.style.color="#9b9a97"}>+ Add shot</button>
                </Section>
                <HR/>

                <Section emoji="✅" title="To-Do List">
                  {arr(brief.toDoList).map((item,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"5px 0"}}>
                      <input type="checkbox" checked={item.done} onChange={e=>upArr("toDoList",i,{...item,done:e.target.checked})} style={{marginTop:3,cursor:"pointer",flexShrink:0,width:15,height:15,accentColor:"#37352f"}}/>
                      <div style={{flex:1,fontSize:14,color:item.done?"#9b9a97":"#37352f",textDecoration:item.done?"line-through":"none",lineHeight:1.6}}><Editable value={item.text} onChange={v=>upArr("toDoList",i,{...item,text:v})}/></div>
                      <button onClick={()=>delArr("toDoList",i)} style={{background:"none",border:"none",color:"#ddd",cursor:"pointer",fontSize:13}} onMouseEnter={e=>e.currentTarget.style.color="#c0392b"} onMouseLeave={e=>e.currentTarget.style.color="#ddd"}>✕</button>
                    </div>
                  ))}
                  <button onClick={()=>addArr("toDoList",{text:"New task",done:false})} style={{background:"none",border:"none",color:"#9b9a97",fontSize:13,cursor:"pointer",fontFamily:"inherit",padding:"4px 0"}} onMouseEnter={e=>e.currentTarget.style.color="#37352f"} onMouseLeave={e=>e.currentTarget.style.color="#9b9a97"}>+ Add task</button>
                </Section>
                <HR/>

                <Section emoji="🏷" title="Tags" defaultOpen={false}>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                    {arr(brief.tags).map((tag,i)=>(
                      <span key={i} style={{background:"#f1f0ef",color:"#55534e",borderRadius:20,padding:"3px 12px",fontSize:12,fontWeight:500,display:"inline-flex",alignItems:"center",gap:6}}>
                        {tag}<button onClick={()=>delArr("tags",i)} style={{background:"none",border:"none",color:"#ccc",cursor:"pointer",fontSize:10,padding:0}}>✕</button>
                      </span>
                    ))}
                    <button onClick={()=>addArr("tags","new tag")} style={{background:"none",border:"1px dashed #e8e4dc",color:"#9b9a97",borderRadius:20,padding:"3px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>+ Tag</button>
                  </div>
                </Section>

                {/* Series Episodes */}
                {arr(brief.concepts).length>0&&<>
                  <HR/>
                  <Section emoji="📺" title={`Series Episodes (${arr(brief.concepts).length})`} defaultOpen>
                    {arr(brief.concepts).map((ep,ei)=>(
                      <div key={ep.id} style={{border:"1px solid #e8e4dc",borderRadius:10,marginBottom:16,overflow:"hidden"}}>
                        <div style={{background:"#f7f6f3",padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"1px solid #e8e4dc"}}>
                          <div style={{fontWeight:700,fontSize:14,flex:1,marginRight:12}}><Editable value={ep.title} onChange={v=>upEp(ei,"title",v)} placeholder={`Episode ${ei+1}`}/></div>
                          <button onClick={()=>{if(window.confirm("Remove this episode?"))delArr("concepts",ei);}} style={{background:"none",border:"none",color:"#ccc",cursor:"pointer",fontSize:13,flexShrink:0}} onMouseEnter={e=>e.currentTarget.style.color="#c0392b"} onMouseLeave={e=>e.currentTarget.style.color="#ccc"}>✕ Remove</button>
                        </div>
                        <div style={{padding:"16px"}}>
                          <div style={{marginBottom:10}}>
                            <div style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>Hook</div>
                            <div style={{fontSize:14,lineHeight:1.8,background:"#fafaf9",borderRadius:6,padding:"10px 14px"}}><Editable value={ep.hook} onChange={v=>upEp(ei,"hook",v)} multiline placeholder="Episode hook…"/></div>
                          </div>
                          <div style={{marginBottom:14}}>
                            <div style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>Angle</div>
                            <div style={{fontSize:14,lineHeight:1.8,background:"#fafaf9",borderRadius:6,padding:"10px 14px"}}><Editable value={ep.angle} onChange={v=>upEp(ei,"angle",v)} multiline placeholder="This episode's unique angle…"/></div>
                          </div>
                          {/* Episode outline */}
                          <div style={{marginBottom:14}}>
                            <div style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>Outline</div>
                            {arr(ep.outline).map((act,i)=>(
                              <div key={i} style={{background:"#f9f8f6",borderLeft:"3px solid #e8e4dc",padding:"10px 14px",borderRadius:"0 6px 6px 0",marginBottom:8}}>
                                <div style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",marginBottom:3}}><Editable value={act.act} onChange={v=>upEpArr(ei,"outline",i,{...act,act:v})} placeholder="Section"/></div>
                                <div style={{fontSize:13,lineHeight:1.7}}><Editable value={act.description} onChange={v=>upEpArr(ei,"outline",i,{...act,description:v})} multiline placeholder="Description…"/></div>
                              </div>
                            ))}
                            <button onClick={()=>addEpArr(ei,"outline",{act:"New Section",description:""})} style={{background:"none",border:"none",color:"#9b9a97",fontSize:12,cursor:"pointer",fontFamily:"inherit",padding:"3px 0"}} onMouseEnter={e=>e.currentTarget.style.color="#37352f"} onMouseLeave={e=>e.currentTarget.style.color="#9b9a97"}>+ Add section</button>
                          </div>
                          {/* Episode shot list */}
                          <div>
                            <div style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>Shot List</div>
                            {arr(ep.shotList).map((shot,i)=>(
                              <div key={i} style={{display:"grid",gridTemplateColumns:"36px 80px 1fr 24px",gap:8,alignItems:"start",padding:"7px 0",borderBottom:"1px solid #f7f6f3"}}>
                                <div style={{fontSize:11,fontWeight:700,color:"#9b9a97",paddingTop:3}}>{shot.number||String(i+1).padStart(2,"0")}</div>
                                <div style={{fontSize:12,fontWeight:600,color:"#e97942"}}><Editable value={shot.type} onChange={v=>upEpArr(ei,"shotList",i,{...shot,type:v})} placeholder="Type"/></div>
                                <div style={{fontSize:13,lineHeight:1.5}}><Editable value={shot.description} onChange={v=>upEpArr(ei,"shotList",i,{...shot,description:v})} multiline placeholder="Shot description…"/></div>
                                <button onClick={()=>delEpArr(ei,"shotList",i)} style={{background:"none",border:"none",color:"#ccc",cursor:"pointer",fontSize:12,paddingTop:3}} onMouseEnter={e=>e.currentTarget.style.color="#c0392b"} onMouseLeave={e=>e.currentTarget.style.color="#ccc"}>✕</button>
                              </div>
                            ))}
                            <button onClick={()=>addEpArr(ei,"shotList",{number:String(arr(ep.shotList).length+1).padStart(2,"0"),type:"B-Roll",description:""})} style={{background:"none",border:"none",color:"#9b9a97",fontSize:12,cursor:"pointer",fontFamily:"inherit",padding:"3px 0",marginTop:6}} onMouseEnter={e=>e.currentTarget.style.color="#37352f"} onMouseLeave={e=>e.currentTarget.style.color="#9b9a97"}>+ Add shot</button>
                          </div>
                        </div>
                      </div>
                    ))}
                    <button onClick={addEpisode} style={{background:"none",border:"1px dashed #e8e4dc",borderRadius:8,padding:"10px 20px",fontSize:13,color:"#55534e",cursor:"pointer",fontFamily:"inherit",width:"100%",textAlign:"center"}} onMouseEnter={e=>{e.currentTarget.style.background="#f7f6f3";}} onMouseLeave={e=>{e.currentTarget.style.background="none";}}>+ Add Episode</button>
                  </Section>
                </>}

                {arr(brief.concepts).length===0&&<>
                  <HR/>
                  <div style={{textAlign:"center",padding:"20px 0 8px"}}>
                    <button onClick={addEpisode} style={{background:"none",border:"1px dashed #e8e4dc",borderRadius:8,padding:"10px 20px",fontSize:13,color:"#9b9a97",cursor:"pointer",fontFamily:"inherit"}} onMouseEnter={e=>{e.currentTarget.style.color="#37352f";e.currentTarget.style.borderColor="#c4c3bf";}} onMouseLeave={e=>{e.currentTarget.style.color="#9b9a97";e.currentTarget.style.borderColor="#e8e4dc";}}>📺 Convert to Series — Add Episode</button>
                  </div>
                </>}
              </>
            )}
          </div>
        </div>
      </div>

      {/* AI Chat panel — fixed to viewport */}
      {chatOpen&&<div style={{position:"fixed",top:0,right:0,width:340,height:"100vh",borderLeft:"1px solid #f1f0ef",display:"flex",flexDirection:"column",background:"#fff",zIndex:200,boxShadow:"-2px 0 12px rgba(0,0,0,0.06)"}}>
        <AIChatPanel chatLog={chatLog} onSend={sendIdeaChat} busy={chatBusy} onClose={()=>setChatOpen(false)}/>
      </div>}
    </div>
  );
}

// ─── PROJECT PICKER MODAL ────────────────────────────────────────────────────
function ProjectPickerModal({ projects, onSelect, onClose }) {
  const [search, setSearch] = useState("");
  const filtered = (projects||[]).filter(p => {
    const q = search.toLowerCase();
    return !q || [p.title, p.client_name].some(s => s?.toLowerCase().includes(q));
  }).sort((a,b) => new Date(b.updated_at) - new Date(a.updated_at));
  return (
    <div style={{position:"fixed",inset:0,zIndex:500,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:12,padding:"24px",width:"min(480px,100%)",maxHeight:"70vh",display:"flex",flexDirection:"column",boxShadow:"0 8px 32px rgba(0,0,0,0.18)"}}>
        <div style={{fontSize:16,fontWeight:700,color:"#37352f",marginBottom:14}}>📁 Link to Project</div>
        <div style={{position:"relative",marginBottom:10,flexShrink:0}}>
          <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:"#9b9a97",fontSize:13}}>🔍</span>
          <input autoFocus value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search projects…"
            style={{width:"100%",border:"1px solid #e8e4dc",borderRadius:8,padding:"9px 12px 9px 32px",fontFamily:"'Lora',serif",fontSize:13,outline:"none",boxSizing:"border-box",color:"#37352f"}}
            onFocus={e=>e.target.style.borderColor="#37352f"} onBlur={e=>e.target.style.borderColor="#e8e4dc"}/>
        </div>
        <div style={{overflowY:"auto",flex:1,margin:"0 -4px"}}>
          {filtered.length === 0
            ? <p style={{color:"#9b9a97",fontSize:13,textAlign:"center",padding:"24px 0",fontStyle:"italic"}}>No projects found</p>
            : filtered.map(p => (
              <button key={p.id} onClick={() => onSelect(p)}
                style={{display:"flex",alignItems:"center",gap:12,width:"100%",padding:"11px 12px",border:"none",background:"none",cursor:"pointer",borderRadius:8,textAlign:"left"}}
                onMouseEnter={e=>e.currentTarget.style.background="#f7f6f3"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <span style={{fontSize:22,flexShrink:0}}>{p.brief?.coverEmoji||"🎬"}</span>
                <div style={{minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:14,color:"#37352f",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.title||"Untitled"}</div>
                  {p.client_name&&<div style={{fontSize:12,color:"#9b9a97"}}>{p.client_name}</div>}
                </div>
              </button>
            ))}
        </div>
        <button onClick={onClose} style={{marginTop:12,background:"transparent",border:"1px solid #e8e4dc",borderRadius:6,padding:"9px",fontFamily:"'Lora',serif",fontSize:13,cursor:"pointer",color:"#9b9a97",flexShrink:0}}>Cancel</button>
      </div>
    </div>
  );
}

// ─── IDEA CAPTURE MAIN ────────────────────────────────────────────────────────
function IdeaCapture({ user, onBack, projects, onOpenProject }) {
  const [workspaces, setWorkspaces] = useState(DEFAULT_WORKSPACES);
  const [activeWs, setActiveWs] = useState("personal");
  const [ideas, setIdeas] = useState({});
  const [loadingData, setLoadingData] = useState(true);
  const [openIdea, setOpenIdea] = useState(null);
  const [input, setInput] = useState("");
  const [interimText, setInterimText] = useState("");
  const [generating, setGenerating] = useState(null);
  const [creatingWs, setCreatingWs] = useState(false);
  const [newWsName, setNewWsName] = useState("");
  const [newWsEmoji, setNewWsEmoji] = useState("💡");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [editingWsId, setEditingWsId] = useState(null);
  const [editingWsName, setEditingWsName] = useState("");
  const [wsMenuOpen, setWsMenuOpen] = useState(null);
  const [ideaSidebarOpen, setIdeaSidebarOpen] = useState(true);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [pickerTargetId, setPickerTargetId] = useState(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoadingData(true);
    // Load workspaces from Supabase
    const { data: wsData } = await supabase.from("idea_workspaces").select("*").eq("user_id", user.id).order("sort_order");
    let loadedWs;
    if (wsData && wsData.length > 0) {
      loadedWs = wsData.map(w => ({ id: w.id, name: w.name, emoji: w.emoji }));
    } else {
      // First time: check localStorage for migration
      const lsWsKey = `framebrief_workspaces_${user?.id}`;
      const lsIdeasKey = `framebrief_ideas_${user?.id}`;
      try { const p = JSON.parse(localStorage.getItem(lsWsKey)); loadedWs = Array.isArray(p) ? p : DEFAULT_WORKSPACES; } catch { loadedWs = DEFAULT_WORKSPACES; }
      // Save workspaces to Supabase
      await supabase.from("idea_workspaces").upsert(loadedWs.map((w, i) => ({ id: w.id, user_id: user.id, name: w.name, emoji: w.emoji, sort_order: i })));
      // Migrate ideas from localStorage
      try {
        const lsIdeas = JSON.parse(localStorage.getItem(lsIdeasKey) || "{}");
        if (lsIdeas && typeof lsIdeas === "object" && !Array.isArray(lsIdeas)) {
          const rows = [];
          Object.entries(lsIdeas).forEach(([wsId, list]) => {
            (list || []).forEach(idea => rows.push({ id: idea.id, user_id: user.id, workspace_id: wsId, raw_text: idea.rawText || "", brief: idea.brief || null, created_at: idea.createdAt || new Date().toISOString(), updated_at: new Date().toISOString() }));
          });
          if (rows.length > 0) await supabase.from("ideas").upsert(rows);
        }
      } catch {}
    }
    setWorkspaces(loadedWs);
    setActiveWs(loadedWs[0]?.id || "personal");
    // Load all ideas
    const { data: ideasData } = await supabase.from("ideas").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    const map = {};
    (ideasData || []).forEach(row => {
      if (!map[row.workspace_id]) map[row.workspace_id] = [];
      map[row.workspace_id].push({ id: row.id, rawText: row.raw_text, brief: row.brief, createdAt: row.created_at, linkedProjectId: row.linked_project_id||null });
    });
    setIdeas(map);
    setLoadingData(false);
  }

  async function saveWorkspaces(updated) {
    setWorkspaces(updated);
    await supabase.from("idea_workspaces").upsert(updated.map((w, i) => ({ id: w.id, user_id: user.id, name: w.name, emoji: w.emoji, sort_order: i })));
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

  async function deleteWorkspace(id) {
    if (!window.confirm("Delete this workspace and all its ideas?")) return;
    const updated = (workspaces||[]).filter(w => w.id !== id);
    saveWorkspaces(updated);
    await supabase.from("ideas").delete().eq("workspace_id", id).eq("user_id", user.id);
    await supabase.from("idea_workspaces").delete().eq("id", id).eq("user_id", user.id);
    const newIdeas = { ...ideas }; delete newIdeas[id]; setIdeas(newIdeas);
    if (activeWs === id) setActiveWs(updated[0]?.id || "");
    setWsMenuOpen(null);
  }

  async function saveIdea() {
    const text = (input + interimText).trim();
    if (!text) return;
    const id = `idea-${Date.now()}`;
    const now = new Date().toISOString();
    const newIdea = { id, rawText: text, brief: null, createdAt: now };
    const wsIdeas = [newIdea, ...(ideas[activeWs] || [])];
    setIdeas(prev => ({ ...prev, [activeWs]: wsIdeas }));
    setInput(""); setInterimText("");
    // Persist to Supabase immediately (briefless)
    await supabase.from("ideas").insert({ id, user_id: user.id, workspace_id: activeWs, raw_text: text, brief: null, created_at: now, updated_at: now });
    // Generate brief
    setGenerating(id);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "anthropic-dangerous-direct-browser-access": "true", "x-api-key": API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: MODEL, max_tokens: 3000, system: IDEA_SYSTEM, messages: [{ role: "user", content: `Generate a creative brief for this idea:\n\n${text}` }] })
      });
      const data = await res.json();
      const raw = (data.content || []).map(b => b.text || "").join("").trim();
      let jsonStr = raw;
      const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenced) jsonStr = fenced[1].trim();
      else { const s = raw.indexOf("{"), e = raw.lastIndexOf("}"); if (s !== -1 && e !== -1) jsonStr = raw.slice(s, e + 1); }
      jsonStr = jsonStr.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");
      const rawBrief = JSON.parse(jsonStr);
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
      setIdeas(prev => ({ ...prev, [activeWs]: (prev[activeWs] || []).map(i => i.id === id ? { ...i, brief } : i) }));
      await supabase.from("ideas").update({ brief, updated_at: new Date().toISOString() }).eq("id", id);
    } catch (e) {
      console.error("Brief generation failed:", e);
    }
    setGenerating(null);
  }

  function updateIdea(updated) {
    setIdeas(prev => {
      const wsId = Object.keys(prev).find(k => (prev[k] || []).some(i => i.id === updated.id)) || activeWs;
      return { ...prev, [wsId]: (prev[wsId] || []).map(i => i.id === updated.id ? updated : i) };
    });
    clearTimeout(window._ideaSaveTimer);
    window._ideaSaveTimer = setTimeout(() => {
      supabase.from("ideas").update({ brief: updated.brief, updated_at: new Date().toISOString() }).eq("id", updated.id);
    }, 1500);
  }

  async function deleteIdea(id) {
    setIdeas(prev => ({ ...prev, [activeWs]: (prev[activeWs] || []).filter(i => i.id !== id) }));
    await supabase.from("ideas").delete().eq("id", id);
  }

  async function linkIdeaToProject(ideaId, project) {
    const wsId = Object.keys(ideas).find(k => (ideas[k]||[]).some(i => i.id === ideaId));
    if (!wsId) return;
    const idea = (ideas[wsId]||[]).find(i => i.id === ideaId);
    if (!idea?.brief) return;
    const b = idea.brief;
    const concept = {
      id: `idea-${ideaId}`,
      emoji: "💡",
      title: b.title || "Untitled Idea",
      type: b.format || "",
      logline: b.logline || "",
      description: b.angle || "",
      moodKeywords: arr(b.tags),
      inspiration: [],
      locations: arr(b.locations).map(l => ({ name: l.name||"", vibe:"", description: l.notes||"", shots:"" })),
      lighting: { style:"", description:"", technical:"" },
      colorHex: ["#c8a97e","#3d2b1f","#f5ede0"],
      colorDescription: "",
      wardrobe: [],
      wardrobeNotes: "",
      props: arr(b.props),
      shotList: arr(b.shotList).map(s => ({ number: s.number||"", type: s.type||"", description: s.description||"", lens:"", notes:"" })),
      script: { hook: b.hook||"", act1:"", act2:"", act3:"", cta:"" },
      deliverableFormat: b.format||"",
      directorNotes: b.scriptNotes||"",
    };
    const existing = arr(project.brief?.concepts).filter(c => c.id !== concept.id);
    const updatedBrief = { ...(project.brief||{}), concepts: [...existing, concept] };
    await supabase.from("projects").update({ brief: updatedBrief, updated_at: new Date().toISOString() }).eq("id", project.id);
    await supabase.from("ideas").update({ linked_project_id: project.id, updated_at: new Date().toISOString() }).eq("id", ideaId);
    setIdeas(prev => ({ ...prev, [wsId]: (prev[wsId]||[]).map(i => i.id === ideaId ? { ...i, linkedProjectId: project.id } : i) }));
    setShowProjectPicker(false); setPickerTargetId(null);
  }

  async function unlinkIdeaFromProject(ideaId) {
    const wsId = Object.keys(ideas).find(k => (ideas[k]||[]).some(i => i.id === ideaId));
    if (!wsId) return;
    const idea = (ideas[wsId]||[]).find(i => i.id === ideaId);
    if (!idea?.linkedProjectId) return;
    const project = (projects||[]).find(p => p.id === idea.linkedProjectId);
    if (project) {
      const updatedBrief = { ...(project.brief||{}), concepts: arr(project.brief?.concepts).filter(c => c.id !== `idea-${ideaId}`) };
      await supabase.from("projects").update({ brief: updatedBrief, updated_at: new Date().toISOString() }).eq("id", project.id);
    }
    await supabase.from("ideas").update({ linked_project_id: null, updated_at: new Date().toISOString() }).eq("id", ideaId);
    setIdeas(prev => ({ ...prev, [wsId]: (prev[wsId]||[]).map(i => i.id === ideaId ? { ...i, linkedProjectId: null } : i) }));
  }

  const ws = workspaces.find(w => w.id === activeWs);
  const wsIdeas = ideas[activeWs] || [];

  // If viewing an idea, show full page
  if (openIdea) {
    const ideaData = wsIdeas.find(i => i.id === openIdea);
    if (ideaData) return (
      <IdeaPage idea={ideaData} onBack={() => setOpenIdea(null)} onUpdate={updateIdea} user={user}
        projects={projects} onLinkProject={proj => linkIdeaToProject(ideaData.id, proj)} onUnlinkProject={() => unlinkIdeaFromProject(ideaData.id)} />
    );
  }

  if (loadingData) return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 14 }}>
      <div className="spin" style={{ width: 28, height: 28, border: "3px solid #e8e4dc", borderTop: "3px solid #37352f", borderRadius: "50%" }} />
      <span style={{ fontSize: 13, color: "#9b9a97", fontFamily: "'Lora',serif" }}>Loading your ideas…</span>
    </div>
  );

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
                      style={{ border: "1px solid #f1f0ef", borderRadius: 10, padding: "18px", background: "#fafaf9", cursor: idea.brief ? "pointer" : "default", transition: "all .15s" }}
                      onMouseEnter={e => idea.brief && (e.currentTarget.style.background = "#f0ede8", e.currentTarget.style.borderColor = "#e0ddd8")}
                      onMouseLeave={e => (e.currentTarget.style.background = "#fafaf9", e.currentTarget.style.borderColor = "#f1f0ef")}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                        <span style={{ fontSize: 26 }}>{idea.brief ? "💡" : "✏️"}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }} onClick={e => e.stopPropagation()}>
                          {idea.brief && <span style={{ fontSize: 11, background: "#eeece8", borderRadius: 20, padding: "3px 10px", color: "#9b9a97", whiteSpace: "nowrap" }}>Open →</span>}
                          {idea.brief && (idea.linkedProjectId
                            ? <span style={{ fontSize: 11, background: "#e6f4ea", color: "#1e7e34", borderRadius: 20, padding: "3px 10px", whiteSpace: "nowrap", fontFamily:"'IBM Plex Mono',monospace", cursor:"pointer" }}
                                title="Click to unlink" onClick={e=>{e.stopPropagation();if(window.confirm("Remove this idea from the project?"))unlinkIdeaFromProject(idea.id);}}>
                                📁 {(projects||[]).find(p=>p.id===idea.linkedProjectId)?.title||"Linked"}
                              </span>
                            : <button onClick={e=>{e.stopPropagation();setPickerTargetId(idea.id);setShowProjectPicker(true);}} style={{fontSize:11,background:"#e8f0fe",color:"#1a56c4",border:"none",borderRadius:20,padding:"3px 10px",cursor:"pointer",fontFamily:"'Lora',serif",whiteSpace:"nowrap"}}>+ Link to Project</button>
                          )}
                          <button onClick={e => { e.stopPropagation(); deleteIdea(idea.id); }} style={{ background: "none", border: "none", color: "#ddd", cursor: "pointer", fontSize: 13, padding: "2px 4px" }}
                            onMouseEnter={e => e.currentTarget.style.color = "#c0392b"} onMouseLeave={e => e.currentTarget.style.color = "#ddd"}>🗑</button>
                        </div>
                      </div>
                      {generating === idea.id && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                          <div className="spin" style={{ width: 13, height: 13, border: "2px solid #e8e4dc", borderTop: "2px solid #37352f", borderRadius: "50%", flexShrink: 0 }} />
                          <span style={{ fontSize: 12, color: "#9b9a97", fontStyle: "italic" }}>Building your creative brief…</span>
                        </div>
                      )}
                      {idea.brief ? (<>
                        <div style={{ fontWeight: 700, fontSize: 14, color: "#37352f", marginBottom: 4, lineHeight: 1.3 }}>{idea.brief.title || "Untitled"}</div>
                        <div style={{ fontSize: 12, color: "#9b9a97", marginBottom: 8, lineHeight: 1.5, fontStyle: "italic" }}>{idea.brief.logline}</div>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
                          {idea.brief.format && <span style={{ fontSize: 11, background: "#f1f0ef", borderRadius: 20, padding: "2px 8px", color: "#9b9a97" }}>{idea.brief.format}</span>}
                          {idea.brief.estimatedLength && <span style={{ fontSize: 11, background: "#f1f0ef", borderRadius: 20, padding: "2px 8px", color: "#9b9a97" }}>{idea.brief.estimatedLength}</span>}
                          {(idea.brief.toDoList||[]).length > 0 && <span style={{ fontSize: 11, background: "#e6f4ea", borderRadius: 20, padding: "2px 8px", color: "#1e7e34" }}>✅ {(idea.brief.toDoList||[]).filter(t=>t.done).length}/{(idea.brief.toDoList||[]).length}</span>}
                          {(idea.brief.shotList||[]).length > 0 && <span style={{ fontSize: 11, background: "#e8f0fe", borderRadius: 20, padding: "2px 8px", color: "#1a56c4" }}>🎥 {(idea.brief.shotList||[]).length} shots</span>}
                        </div>
                      </>) : (
                        <div style={{ fontSize: 13, color: "#55534e", lineHeight: 1.65, marginBottom: 8 }}>{idea.rawText.length > 100 ? idea.rawText.slice(0, 100) + "…" : idea.rawText}</div>
                      )}
                      <div style={{ fontSize: 11, color: "#c4c3bf", fontFamily: "'IBM Plex Mono',monospace" }}>
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
      {showProjectPicker && (
        <ProjectPickerModal
          projects={projects||[]}
          onSelect={proj => linkIdeaToProject(pickerTargetId, proj)}
          onClose={() => { setShowProjectPicker(false); setPickerTargetId(null); }}
        />
      )}
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

// ─── MAPS LINK HELPER ─────────────────────────────────────────────────────────
function MapLinks({address}){
  if(!address)return null;
  const q=encodeURIComponent(address);
  const linkStyle={fontSize:11,color:"#1a56c4",textDecoration:"none",background:"#e8f0fe",borderRadius:20,padding:"2px 9px",display:"inline-flex",alignItems:"center",gap:3};
  return(
    <div style={{display:"flex",gap:6,marginTop:5,flexWrap:"wrap"}}>
      <a href={`https://www.google.com/maps/search/?api=1&query=${q}`} target="_blank" rel="noopener noreferrer" style={linkStyle} onMouseEnter={e=>e.currentTarget.style.background="#d2e3fc"} onMouseLeave={e=>e.currentTarget.style.background="#e8f0fe"}>Google Maps ↗</a>
      <a href={`https://maps.apple.com/?q=${q}`} target="_blank" rel="noopener noreferrer" style={linkStyle} onMouseEnter={e=>e.currentTarget.style.background="#d2e3fc"} onMouseLeave={e=>e.currentTarget.style.background="#e8f0fe"}>Apple Maps ↗</a>
    </div>
  );
}

// ─── CLIENT COMBOBOX ─────────────────────────────────────────────────────────
function ClientCombobox({value,clientId,clients,onChange,onLink,onUnlink,onGoToProfile,onCreateAndLink}){
  const[input,setInput]=useState(value||"");
  const[open,setOpen]=useState(false);
  const[creating,setCreating]=useState(false);
  const wrapRef=useRef();
  useEffect(()=>{setInput(value||"");},[value]);
  useEffect(()=>{
    function down(e){if(!wrapRef.current?.contains(e.target))setOpen(false);}
    document.addEventListener("mousedown",down);
    return()=>document.removeEventListener("mousedown",down);
  },[]);
  const filtered=arr(clients).filter(c=>{
    const q=input.trim().toLowerCase();
    return!q||c.name.toLowerCase().includes(q)||(c.company||"").toLowerCase().includes(q);
  }).slice(0,6);
  const exactMatch=arr(clients).find(c=>c.name.toLowerCase()===input.trim().toLowerCase());
  const showCreate=input.trim()&&!exactMatch;
  async function handleCreate(){
    if(!input.trim()||creating)return;
    setCreating(true);
    await onCreateAndLink(input.trim());
    setCreating(false);setOpen(false);
  }
  return(
    <div ref={wrapRef} style={{position:"relative",flex:1}}>
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <input value={input} onChange={e=>{setInput(e.target.value);onChange(e.target.value);setOpen(true);}} onFocus={()=>setOpen(true)} placeholder="Search or type client name…" style={{flex:1,border:"none",outline:"none",fontSize:14,color:"#37352f",fontFamily:"'Lora',serif",background:"transparent",padding:0,minWidth:0}}/>
        {clientId&&(
          <div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
            <span style={{fontSize:10,background:"#e6f4ea",color:"#1e7e34",borderRadius:20,padding:"2px 7px",fontWeight:600,fontFamily:"'IBM Plex Mono',monospace",letterSpacing:"0.04em"}}>Linked</span>
            {onGoToProfile&&<button onClick={onGoToProfile} style={{background:"none",border:"none",color:"#1a56c4",cursor:"pointer",fontSize:12,padding:"0 2px",lineHeight:1}} title="View client profile">↗</button>}
            <button onClick={()=>{setInput("");onChange("");onUnlink();}} style={{background:"none",border:"none",color:"#c4c3bf",cursor:"pointer",fontSize:13,padding:"0 2px",lineHeight:1}} title="Unlink client">✕</button>
          </div>
        )}
      </div>
      {open&&(filtered.length>0||showCreate)&&(
        <div style={{position:"absolute",top:"calc(100% + 8px)",left:-16,right:-16,background:"#fff",border:"1px solid #e8e4dc",borderRadius:8,boxShadow:"0 4px 16px rgba(0,0,0,0.1)",zIndex:200,overflow:"hidden",maxHeight:240,overflowY:"auto"}}>
          {filtered.length>0&&(
            <>
              <div style={{padding:"8px 12px 4px",fontSize:10,fontFamily:"'IBM Plex Mono',monospace",color:"#c4c3bf",textTransform:"uppercase",letterSpacing:"0.08em"}}>Existing clients</div>
              {filtered.map(c=>(
                <div key={c.id} onClick={()=>{setInput(c.name);onLink(c);setOpen(false);}} style={{padding:"9px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:8}} onMouseEnter={e=>e.currentTarget.style.background="#f7f6f3"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <div style={{width:26,height:26,borderRadius:6,background:"#37352f",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:700,fontSize:11,flexShrink:0}}>{(c.name||"?").charAt(0).toUpperCase()}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,color:"#37352f",fontWeight:600}}>{c.name}</div>
                    {c.company&&<div style={{fontSize:11,color:"#9b9a97"}}>{c.company}</div>}
                  </div>
                  {c.id===clientId&&<span style={{fontSize:10,color:"#1e7e34",background:"#e6f4ea",borderRadius:20,padding:"1px 7px",fontWeight:600,fontFamily:"'IBM Plex Mono',monospace",flexShrink:0}}>Current</span>}
                </div>
              ))}
            </>
          )}
          {showCreate&&(
            <div onClick={handleCreate} style={{padding:"10px 14px",cursor:creating?"not-allowed":"pointer",display:"flex",alignItems:"center",gap:8,borderTop:filtered.length>0?"1px solid #f1f0ef":"none",opacity:creating?0.6:1}} onMouseEnter={e=>{if(!creating)e.currentTarget.style.background="#f7f6f3";}} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <div style={{width:26,height:26,borderRadius:6,background:"#e97942",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:700,fontSize:16,flexShrink:0}}>+</div>
              <div style={{fontSize:13,color:"#37352f"}}>{creating?`Creating…`:`Create "${input.trim()}"`}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── OVERVIEW PAGE ────────────────────────────────────────────────────────────
function OverviewPage({brief,setBrief,goTo,readonly,recallStatus,recallBotId,projectId,onTranscriptReady,onGenerateBrief,briefGenError,clientId,onClientClick,clients,onClientLink,onClientUnlink,onClientCreateAndLink,meetingStage,onStageChange}){
  const set=(k,v)=>setBrief(b=>({...b,[k]:v}));
  const upArr=(k,i,v)=>setBrief(b=>{const a=[...(b[k]||[])];a[i]=v;return{...b,[k]:a};});
  const delArr=(k,i)=>setBrief(b=>({...b,[k]:(b[k]||[]).filter((_,j)=>j!==i)}));
  const addArr=(k,item)=>setBrief(b=>({...b,[k]:[...(b[k]||[]),item]}));
  const cT=brief.clientActionItems||[];const iT=brief.internalTodos||[];
  return(
    <div style={{maxWidth:760,padding:"40px 24px 120px",margin:"0 auto"}}>
      {recallStatus==="transcribing"&&!readonly&&(
        <div style={{background:"#fef3e2",border:"1px solid #fde8c8",borderRadius:10,padding:"12px 16px",marginBottom:24,display:"flex",alignItems:"center",gap:8}}>
          <div className="spin" style={{width:13,height:13,border:"2px solid #fde8c8",borderTop:"2px solid #b45309",borderRadius:"50%",flexShrink:0}}/>
          <span style={{fontSize:13,color:"#92400e",fontWeight:600}}>Transcribing your meeting…</span>
        </div>
      )}
      {briefGenError&&!readonly&&(
        <div style={{background:"#fff2f2",border:"1px solid #ffc9c9",borderRadius:10,padding:"14px 18px",marginBottom:24,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:14}}>⚠️</span>
            <div><span style={{fontSize:13,fontWeight:700,color:"#c0392b"}}>Brief generation failed</span><span style={{fontSize:12,color:"#9b9a97",marginLeft:8}}>Tap to retry</span></div>
          </div>
          {onGenerateBrief&&(
            <button onClick={onGenerateBrief} style={{background:"#c0392b",color:"#fff",border:"none",padding:"7px 16px",borderRadius:6,fontFamily:"'Lora',serif",fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
              ↺ Retry
            </button>
          )}
        </div>
      )}
      <div style={{fontSize:48,marginBottom:10}}>{brief.coverEmoji||"🎬"}</div>
      {readonly?<h1 style={{fontSize:34,fontWeight:700,letterSpacing:"-0.025em",margin:"0 0 8px",color:"#37352f",lineHeight:1.2}}>{brief.projectTitle}</h1>:<h1 contentEditable suppressContentEditableWarning onBlur={e=>set("projectTitle",e.target.innerText)} style={{fontSize:34,fontWeight:700,letterSpacing:"-0.025em",margin:"0 0 8px",outline:"none",color:"#37352f",lineHeight:1.2}}>{brief.projectTitle}</h1>}
      <div style={{fontSize:15,color:"#9b9a97",fontStyle:"italic",marginBottom:20,lineHeight:1.6}}>{readonly?<p style={{margin:0}}>{brief.logline}</p>:<Editable value={brief.logline} onChange={v=>set("logline",v)} placeholder="Project logline…"/>}</div>
      <div style={{border:"1px solid #f1f0ef",borderRadius:10,overflow:"hidden",marginBottom:28}}>
        <PropRow label="Client">
          {readonly
            ?(clientId&&onClientClick?<span style={{cursor:"pointer",color:"#1a56c4",display:"inline-flex",alignItems:"center",gap:4}} onClick={onClientClick}>{brief.clientName||"View Client"}<span style={{fontSize:11,color:"#9b9a97"}}>↗</span></span>:brief.clientName)
            :<ClientCombobox value={brief.clientName||""} clientId={clientId} clients={clients||[]} onChange={v=>set("clientName",v)} onLink={onClientLink} onUnlink={onClientUnlink} onGoToProfile={clientId&&onClientClick?onClientClick:null} onCreateAndLink={onClientCreateAndLink}/>
          }
        </PropRow>
        <PropRow label="Stage">
          {readonly
            ?<span style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",background:STAGE_COLORS[meetingStage||"discovery"]?.bg,color:STAGE_COLORS[meetingStage||"discovery"]?.c,borderRadius:20,padding:"2px 10px",fontWeight:600,textTransform:"capitalize"}}>{(meetingStage||"discovery").replace("_"," ")}</span>
            :<div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {STAGES.map(s=>{const active=(meetingStage||"discovery")===s.id;const sc=STAGE_COLORS[s.id];return(<span key={s.id} onClick={()=>onStageChange&&onStageChange(s.id)} style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",background:active?sc.bg:"#f7f6f3",color:active?sc.c:"#9b9a97",borderRadius:20,padding:"3px 10px",fontWeight:active?700:400,cursor:"pointer",border:`1px solid ${active?sc.c:"transparent"}`,transition:"all .15s",userSelect:"none"}}>{s.emoji} {s.label}</span>);})}
            </div>
          }
        </PropRow>
        {[["Project Type","projectType"],["Date","date"],["Timeline","timeline"],["Budget","budget"]].map(([l,k])=>(<PropRow key={k} label={l}>{readonly?brief[k]:<Editable value={brief[k]} onChange={v=>set(k,v)}/>}</PropRow>))}
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
      <Section emoji="📍" title="Overall Locations">{(brief.overallLocations||[]).map((loc,i)=>(<div key={i} style={{padding:"12px 14px",background:"#f7f6f3",borderRadius:8,marginBottom:8,border:"1px solid #eeece8"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}><div style={{flex:1}}><div style={{fontWeight:700,fontSize:14,marginBottom:3}}>{readonly?loc.name:<Editable value={loc.name} onChange={v=>upArr("overallLocations",i,{...loc,name:v})} placeholder="Location name"/>}</div><div style={{fontSize:12,color:"#55534e",marginBottom:2}}>{readonly?(loc.address||null):<Editable value={loc.address||""} onChange={v=>upArr("overallLocations",i,{...loc,address:v})} placeholder="📍 Add address…"/>}</div><MapLinks address={loc.address}/><div style={{fontSize:13,color:"#55534e",lineHeight:1.7,marginTop:loc.address?8:4}}>{readonly?<p style={{margin:0}}>{loc.description}</p>:<Editable value={loc.description} onChange={v=>upArr("overallLocations",i,{...loc,description:v})} multiline placeholder="Describe…"/>}</div></div>{!readonly&&<button onClick={()=>delArr("overallLocations",i)} style={{background:"none",border:"none",color:"#ccc",cursor:"pointer",fontSize:13,marginLeft:8}}>✕</button>}</div></div>))}{!readonly&&<AddBtn label="Add location" onClick={()=>addArr("overallLocations",{name:"New Location",address:"",description:""})}/>}</Section><HR/>
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
  const [hooksBusy,setHooksBusy]=React.useState(false);
  const [hooksErr,setHooksErr]=React.useState("");
  const generateHooks=async(append)=>{
    setHooksBusy(true);setHooksErr("");
    try{
      const res=await fetch("/api/generate-hooks",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({concept})});
      const data=await res.json();
      if(!res.ok){setHooksErr(`Error: ${data?.error||res.status}`);setHooksBusy(false);return;}
      const newHooks=data.hooks||[];
      if(newHooks.length){onChange({...concept,hooks:[...(append?arr(concept.hooks):[]),...newHooks]});}
      else{setHooksErr("No hooks returned — try again.");}
    }catch(err){setHooksErr(`Error: ${err.message}`);}
    setHooksBusy(false);
  };
  return(
    <div style={{maxWidth:760,padding:"40px 24px 120px",margin:"0 auto"}}>
      <div style={{fontSize:44,marginBottom:10}}>{concept.emoji||"🎬"}</div>
      <div style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.14em",marginBottom:8}}>Concept</div>
      {readonly?<h1 style={{fontSize:32,fontWeight:700,letterSpacing:"-0.025em",margin:"0 0 8px",color:"#37352f",lineHeight:1.15}}>{concept.title}</h1>:<h1 contentEditable suppressContentEditableWarning onBlur={e=>up("title",e.target.innerText)} style={{fontSize:32,fontWeight:700,letterSpacing:"-0.025em",margin:"0 0 8px",outline:"none",color:"#37352f",lineHeight:1.15}}>{concept.title}</h1>}
      <div style={{fontSize:14,color:"#9b9a97",fontStyle:"italic",marginBottom:22,lineHeight:1.6}}>{readonly?<p style={{margin:0}}>{concept.logline}</p>:<Editable value={concept.logline} onChange={v=>up("logline",v)} placeholder="One sentence about this concept…"/>}</div>
      {readonly&&concept.selectedHook&&<div style={{background:"#fffbf7",border:"2px solid #e97942",borderRadius:10,padding:"16px 20px",marginBottom:22}}><div style={{fontSize:10,fontFamily:"'IBM Plex Mono',monospace",color:"#e97942",textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:8}}>Opening Hook</div><div style={{fontSize:16,lineHeight:1.65,color:"#37352f",fontFamily:"'Lora',Georgia,serif",fontStyle:"italic"}}>"{concept.selectedHook}"</div></div>}
      <div style={{border:"1px solid #f1f0ef",borderRadius:10,overflow:"hidden",marginBottom:28}}><PropRow label="Type">{readonly?concept.type:<Editable value={concept.type} onChange={v=>up("type",v)} placeholder="e.g. Music Video"/>}</PropRow><PropRow label="Deliverable">{readonly?concept.deliverableFormat:<Editable value={concept.deliverableFormat} onChange={v=>up("deliverableFormat",v)} placeholder="e.g. 4-min video"/>}</PropRow></div>
      <Section emoji="📋" title="Concept Description"><div style={{fontSize:15,lineHeight:1.95}}>{readonly?<p style={{margin:0,whiteSpace:"pre-wrap"}}>{concept.description}</p>:<Editable value={concept.description} onChange={v=>up("description",v)} multiline placeholder="Describe this concept…"/>}</div></Section><HR/>
      <Section emoji="🎣" title="Hook Options">{arr(concept.hooks).length===0&&!readonly?<><button onClick={()=>generateHooks(false)} disabled={hooksBusy} style={{background:"#f9f8f6",border:"1px dashed #e8e4dc",borderRadius:8,padding:"12px 20px",fontSize:13,color:hooksBusy?"#c4c3bf":"#55534e",cursor:hooksBusy?"wait":"pointer",fontFamily:"inherit",width:"100%",textAlign:"center"}}>{hooksBusy?"Generating…":"✦ Generate Hooks"}</button>{hooksErr&&<div style={{fontSize:12,color:"#c0392b",marginTop:8}}>{hooksErr}</div>}</>:<>{arr(concept.hooks).map((hook,i)=>{const sel=concept.selectedHook===hook;return(<div key={i} onClick={()=>!readonly&&up("selectedHook",sel?"":hook)} style={{padding:"14px 16px",borderRadius:8,marginBottom:8,border:sel?"2px solid #e97942":"1px solid #eeece8",background:sel?"#fffbf7":"#f7f6f3",cursor:readonly?"default":"pointer",position:"relative"}}>{sel&&<div style={{position:"absolute",top:10,right:12,fontSize:10,color:"#e97942",fontWeight:700,fontFamily:"'IBM Plex Mono',monospace",letterSpacing:"0.08em"}}>SELECTED</div>}<div style={{fontSize:14,lineHeight:1.65,color:"#37352f",paddingRight:sel?76:0}}>{readonly?hook:<Editable value={hook} onChange={v=>upArr("hooks",i,v)}/>}</div>{!readonly&&<button onClick={e=>{e.stopPropagation();const nh=arr(concept.hooks).filter((_,j)=>j!==i);onChange({...concept,hooks:nh,selectedHook:concept.selectedHook===hook?"":concept.selectedHook});}} style={{position:"absolute",bottom:8,right:10,background:"none",border:"none",color:"#ccc",cursor:"pointer",fontSize:11}}>✕</button>}</div>);})} {!readonly&&<><div style={{display:"flex",gap:8,marginTop:8,flexWrap:"wrap"}}><button onClick={()=>generateHooks(true)} disabled={hooksBusy} style={{background:"none",border:"1px solid #e8e4dc",borderRadius:6,padding:"6px 14px",fontSize:12,color:hooksBusy?"#c4c3bf":"#55534e",cursor:hooksBusy?"wait":"pointer",fontFamily:"inherit"}}>{hooksBusy?"Generating…":"+ Generate More Hooks"}</button><button onClick={()=>addArr("hooks","Write your hook here…")} style={{background:"none",border:"1px solid #e8e4dc",borderRadius:6,padding:"6px 14px",fontSize:12,color:"#55534e",cursor:"pointer",fontFamily:"inherit"}}>+ Write Custom Hook</button></div>{hooksErr&&<div style={{fontSize:12,color:"#c0392b",marginTop:6}}>{hooksErr}</div>}</> }</> }</Section><HR/>
      <Section emoji="🎭" title="Mood & Inspiration">
        <div style={{display:"flex",flexWrap:"wrap",marginBottom:12}}>{(concept.moodKeywords||[]).map((k,i)=>readonly?<span key={i} style={{background:"#fdeee4",color:"#b94a1a",borderRadius:20,padding:"3px 12px",fontSize:12,fontWeight:500,margin:"2px 3px"}}>{k}</span>:<Tag key={i} value={k} bg="#fdeee4" color="#b94a1a" onEdit={v=>upArr("moodKeywords",i,v)} onDelete={()=>delArr("moodKeywords",i)}/>)}{!readonly&&<AddBtn label="Add" onClick={()=>addArr("moodKeywords","mood")}/>}</div>
        <div style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>Visual References & Links</div>
        <p style={{fontSize:12,color:"#c4c3bf",marginBottom:8,fontStyle:"italic"}}>Paste a URL or type a reference name.</p>
        <div style={{display:"flex",flexWrap:"wrap"}}>{(concept.inspiration||[]).map((r,i)=>readonly?(isURL(r)?<a key={i} href={r} target="_blank" rel="noopener noreferrer" style={{background:"#e8f0fe",color:"#1a56c4",borderRadius:20,padding:"3px 12px",fontSize:12,fontWeight:500,margin:"2px 3px",textDecoration:"none"}}>{r.replace(/^https?:\/\//,"").split("/")[0]}</a>:<span key={i} style={{background:"#e8f0fe",color:"#1a56c4",borderRadius:20,padding:"3px 12px",fontSize:12,fontWeight:500,margin:"2px 3px"}}>{r}</span>):<Tag key={i} value={r} bg="#e8f0fe" color="#1a56c4" onEdit={v=>upArr("inspiration",i,v)} onDelete={()=>delArr("inspiration",i)}/>)}{!readonly&&<AddBtn label="Add reference or paste link" onClick={()=>addArr("inspiration","https://")}/>}</div>
      </Section><HR/>
      <Section emoji="📍" title="Locations">{(concept.locations||[]).map((loc,i)=>(<div key={i} style={{background:"#f7f6f3",borderRadius:8,padding:"14px 16px",marginBottom:10,border:"1px solid #eeece8"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}><div style={{flex:1}}><div style={{fontWeight:700,fontSize:14,marginBottom:2}}>{readonly?loc.name:<Editable value={loc.name} onChange={v=>upArr("locations",i,{...loc,name:v})} placeholder="Location name"/>}</div><div style={{fontSize:12,color:"#55534e",marginBottom:2}}>{readonly?(loc.address||null):<Editable value={loc.address||""} onChange={v=>upArr("locations",i,{...loc,address:v})} placeholder="📍 Add address…"/>}</div><MapLinks address={loc.address}/><div style={{fontSize:11,color:"#e97942",fontWeight:600,marginTop:loc.address?8:4,marginBottom:6}}>{readonly?loc.vibe:<Editable value={loc.vibe} onChange={v=>upArr("locations",i,{...loc,vibe:v})} placeholder="Vibe tag"/>}</div><div style={{fontSize:13,color:"#55534e",lineHeight:1.75,marginBottom:8}}>{readonly?<p style={{margin:0}}>{loc.description}</p>:<Editable value={loc.description} onChange={v=>upArr("locations",i,{...loc,description:v})} multiline placeholder="Describe…"/>}</div><div style={{borderTop:"1px solid #e8e4dc",paddingTop:8,fontSize:12,color:"#9b9a97"}}><span style={{fontWeight:600,color:"#55534e"}}>Shot opportunities: </span>{readonly?loc.shots:<Editable value={loc.shots} onChange={v=>upArr("locations",i,{...loc,shots:v})} multiline placeholder="What can we capture here?"/>}</div></div>{!readonly&&<button onClick={()=>delArr("locations",i)} style={{background:"none",border:"none",color:"#ccc",cursor:"pointer",fontSize:13,marginLeft:10}}>✕</button>}</div></div>))}{!readonly&&<AddBtn label="Add location" onClick={()=>addArr("locations",{name:"New Location",address:"",vibe:"",description:"",shots:""})}/>}</Section><HR/>
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
async function startRecallBot(meetingUrl, projectId) {
  // Route through our own Vercel function to avoid CORS issues
  const res = await fetch(`/api/recall-webhook?action=create-bot`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ meetingUrl, projectId: projectId || null })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Failed to start bot");
  return data; // returns { botId, status }
}

function MeetingBotPanel({ projectId, onBotStarted, recallStatus, recallBotId, onTranscriptReady }) {
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
      onBotStarted(bot.botId || bot.id);
    } catch(err) {
      setError(err.message);
    }
    setLoading(false);
  }

  if (recallStatus === "transcript_ready") return (
    <div style={{background:"#e6f4ea",border:"1px solid #a8d5b5",borderRadius:10,padding:"14px 18px",marginBottom:20}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
        <span style={{fontSize:16}}>📝</span>
        <span style={{fontWeight:700,fontSize:14,color:"#1e7e34"}}>Transcript ready — brief not generated yet</span>
      </div>
      <p style={{fontSize:13,color:"#1e7e34",margin:"0 0 12px"}}>The transcript was saved but the brief wasn't generated. Click below to generate it now.</p>
      <button onClick={async()=>{
        setLoading(true);setError("");
        try{
          const res=await fetch(`/api/recall-webhook?action=fetch-transcript`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({botId:recallBotId,projectId})});
          const data=await res.json();
          if(data.ok){if(onTranscriptReady)onTranscriptReady();}
          else setError(data.message||"Failed — try again");
        }catch(err){setError(err.message);}
        setLoading(false);
      }} disabled={loading||!recallBotId||!projectId} style={{background:"#1e7e34",color:"#fff",border:"none",padding:"9px 20px",borderRadius:6,fontFamily:"'Lora',serif",fontSize:13,cursor:loading?"not-allowed":"pointer",display:"flex",alignItems:"center",gap:8,opacity:loading?0.7:1}}>
        {loading&&<div className="spin" style={{width:13,height:13,border:"2px solid rgba(255,255,255,0.3)",borderTop:"2px solid #fff",borderRadius:"50%"}}/>}
        {loading?"Generating…":"✦ Generate Brief Now"}
      </button>
      {error&&<p style={{fontSize:12,color:"#c0392b",marginTop:8}}>{error}</p>}
    </div>
  );

  if (botStarted || recallStatus === "bot_joined") return (
    <div style={{background:"#e8f0fe",border:"1px solid #b3c9f9",borderRadius:10,padding:"14px 18px",marginBottom:20}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
        <div className="spin" style={{width:14,height:14,border:"2px solid #b3c9f9",borderTop:"2px solid #1a56c4",borderRadius:"50%",flexShrink:0}}/>
        <span style={{fontWeight:700,fontSize:14,color:"#1a56c4"}}>Bot is recording</span>
      </div>
      <p style={{fontSize:13,color:"#1a56c4",marginBottom:10}}>When the meeting ends, click below to fetch the transcript and generate your brief.</p>
      <button onClick={async()=>{
        if(!recallBotId||!projectId){alert("No bot ID found.");return;}
        setLoading(true);
        try{
          const res=await fetch("/api/recall-webhook?action=fetch-transcript",{
            method:"POST",headers:{"Content-Type":"application/json"},
            body:JSON.stringify({botId:recallBotId,projectId})
          });
          const data=await res.json();
          if(data.transcriptLength>0){onTranscriptReady();}
          else{alert("Transcript not ready yet. Try again in a minute. Debug: "+data.message);}
        }catch(e){alert("Error: "+e.message);}
        setLoading(false);
      }} style={{background:"#1a56c4",color:"#fff",border:"none",borderRadius:6,padding:"8px 16px",fontSize:13,cursor:"pointer",fontFamily:"'Lora',serif"}}>
        {loading?"Fetching…":"📄 Fetch Transcript & Generate Brief"}
      </button>
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

// ─── CLIENT LIST ─────────────────────────────────────────────────────────────
function ClientList({clients,projects,onNew,onOpen,onBack,user}){
  const[search,setSearch]=useState("");
  const[showNew,setShowNew]=useState(false);
  const[newName,setNewName]=useState("");
  const[newCompany,setNewCompany]=useState("");
  const[newIndustry,setNewIndustry]=useState("");
  const[saving,setSaving]=useState(false);
  const filtered=clients.filter(c=>{const q=search.toLowerCase();return!q||[c.name,c.company,c.email,c.industry].some(s=>s?.toLowerCase().includes(q));});
  async function createClient(){
    if(!newName.trim())return;
    setSaving(true);
    const{data,error}=await supabase.from("clients").insert({name:newName.trim(),company:newCompany.trim()||null,industry:newIndustry.trim()||null,user_id:user.id}).select().single();
    setSaving(false);
    if(!error&&data){onNew(data);setShowNew(false);setNewName("");setNewCompany("");setNewIndustry("");}
  }
  return(
    <div style={{minHeight:"100vh",background:"#fff"}}>
      <div style={{borderBottom:"1px solid #f1f0ef",padding:"12px 20px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <button onClick={onBack} style={{background:"none",border:"none",color:"#9b9a97",cursor:"pointer",fontSize:13,fontFamily:"'Lora',serif",display:"flex",alignItems:"center",gap:4}}>← Dashboard</button>
          <span style={{color:"#e8e4dc"}}>·</span>
          <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:11,letterSpacing:"0.08em",color:"#37352f",fontWeight:500}}>CLIENTS</span>
        </div>
        <button onClick={()=>setShowNew(true)} style={{background:"#37352f",color:"#fff",border:"none",padding:"8px 16px",borderRadius:6,fontFamily:"'Lora',serif",fontSize:13,cursor:"pointer"}}>+ New Client</button>
      </div>
      <div style={{maxWidth:960,margin:"0 auto",padding:"32px 24px"}}>
        <h1 style={{fontSize:26,fontWeight:700,color:"#37352f",marginBottom:20,letterSpacing:"-0.02em"}}>Clients</h1>
        <div style={{position:"relative",marginBottom:24,maxWidth:380}}>
          <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:14,color:"#9b9a97"}}>🔍</span>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search clients…" style={{width:"100%",border:"1px solid #e8e4dc",borderRadius:8,padding:"10px 14px 10px 36px",fontFamily:"'Lora',serif",fontSize:13,color:"#37352f",outline:"none",background:"#fafaf9",boxSizing:"border-box"}} onFocus={e=>e.target.style.borderColor="#37352f"} onBlur={e=>e.target.style.borderColor="#e8e4dc"}/>
        </div>
        {showNew&&(
          <div style={{border:"1px solid #e8e4dc",borderRadius:10,padding:"20px",marginBottom:24,background:"#fafaf9"}}>
            <div style={{fontSize:13,fontWeight:700,color:"#37352f",marginBottom:14}}>New Client</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
              <div>
                <div style={{fontSize:10,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5}}>Name *</div>
                <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Client name" style={{width:"100%",border:"1px solid #e8e4dc",borderRadius:6,padding:"9px 12px",fontSize:13,fontFamily:"'Lora',serif",outline:"none",color:"#37352f",boxSizing:"border-box"}} onFocus={e=>e.target.style.borderColor="#37352f"} onBlur={e=>e.target.style.borderColor="#e8e4dc"} onKeyDown={e=>e.key==="Enter"&&createClient()}/>
              </div>
              <div>
                <div style={{fontSize:10,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5}}>Company</div>
                <input value={newCompany} onChange={e=>setNewCompany(e.target.value)} placeholder="Company" style={{width:"100%",border:"1px solid #e8e4dc",borderRadius:6,padding:"9px 12px",fontSize:13,fontFamily:"'Lora',serif",outline:"none",color:"#37352f",boxSizing:"border-box"}} onFocus={e=>e.target.style.borderColor="#37352f"} onBlur={e=>e.target.style.borderColor="#e8e4dc"}/>
              </div>
            </div>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:10,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5}}>Industry</div>
              <input value={newIndustry} onChange={e=>setNewIndustry(e.target.value)} placeholder="e.g. Music, Corporate, Wedding…" style={{width:"100%",border:"1px solid #e8e4dc",borderRadius:6,padding:"9px 12px",fontSize:13,fontFamily:"'Lora',serif",outline:"none",color:"#37352f",boxSizing:"border-box"}} onFocus={e=>e.target.style.borderColor="#37352f"} onBlur={e=>e.target.style.borderColor="#e8e4dc"} onKeyDown={e=>e.key==="Enter"&&createClient()}/>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={createClient} disabled={!newName.trim()||saving} style={{background:"#37352f",color:"#fff",border:"none",padding:"9px 20px",borderRadius:6,fontFamily:"'Lora',serif",fontSize:13,cursor:newName.trim()&&!saving?"pointer":"not-allowed",opacity:newName.trim()&&!saving?1:0.5}}>{saving?"Saving…":"Create Client"}</button>
              <button onClick={()=>{setShowNew(false);setNewName("");setNewCompany("");setNewIndustry("");}} style={{background:"transparent",color:"#9b9a97",border:"1px solid #e8e4dc",padding:"8px 16px",borderRadius:6,fontFamily:"'Lora',serif",fontSize:13,cursor:"pointer"}}>Cancel</button>
            </div>
          </div>
        )}
        {filtered.length===0?(
          <div style={{textAlign:"center",padding:"60px 20px"}}>
            <div style={{fontSize:44,marginBottom:14}}>👥</div>
            <p style={{fontSize:17,fontWeight:600,color:"#37352f",marginBottom:8}}>{search?"No clients match":"No clients yet"}</p>
            <p style={{fontSize:14,color:"#9b9a97",marginBottom:20}}>{search?"Try a different search.":"Add your first client to get started."}</p>
            {!search&&<button onClick={()=>setShowNew(true)} style={{background:"#37352f",color:"#fff",border:"none",padding:"11px 24px",borderRadius:6,fontFamily:"'Lora',serif",fontSize:14,cursor:"pointer"}}>+ Add First Client</button>}
          </div>
        ):(
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(260px, 1fr))",gap:14}}>
            {filtered.map(c=>{
              const cp=projects.filter(p=>p.client_id===c.id);
              return(
                <div key={c.id} onClick={()=>onOpen(c)} style={{border:"1px solid #f1f0ef",borderRadius:10,padding:"20px",background:"#fafaf9",cursor:"pointer",transition:"all .15s"}} onMouseEnter={e=>{e.currentTarget.style.background="#f0ede8";e.currentTarget.style.borderColor="#e0ddd8";}} onMouseLeave={e=>{e.currentTarget.style.background="#fafaf9";e.currentTarget.style.borderColor="#f1f0ef";}}>
                  <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:10}}>
                    <div style={{width:40,height:40,borderRadius:10,background:"#37352f",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:700,fontSize:16,flexShrink:0}}>{(c.name||"?").charAt(0).toUpperCase()}</div>
                    {c.industry&&<span style={{fontSize:10,background:"#fdeee4",color:"#b94a1a",borderRadius:20,padding:"2px 8px",fontWeight:600,fontFamily:"'IBM Plex Mono',monospace",letterSpacing:"0.04em"}}>{c.industry}</span>}
                  </div>
                  <div style={{fontWeight:700,fontSize:15,color:"#37352f",marginBottom:2,lineHeight:1.3}}>{c.name}</div>
                  {c.company&&<div style={{fontSize:12,color:"#9b9a97",marginBottom:6}}>{c.company}</div>}
                  <div style={{display:"flex",gap:12,fontSize:11,color:"#c4c3bf",fontFamily:"'IBM Plex Mono',monospace",marginTop:10,paddingTop:10,borderTop:"1px solid #f1f0ef"}}>
                    <span>{cp.length} project{cp.length!==1?"s":""}</span>
                    {c.email&&<span title={c.email}>✉️</span>}
                    {c.phone&&<span title={c.phone}>📞</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── CLIENT PROFILE ───────────────────────────────────────────────────────────
function ClientProfile({clientId,clients,setClients,projects,onBack,onOpenProject,onNewProject,onLinkProject}){
  const[deleteConfirm,setDeleteConfirm]=useState(false);
  const[showLink,setShowLink]=useState(false);
  const[linkId,setLinkId]=useState("");
  const[linking,setLinking]=useState(false);
  const client=clients.find(c=>c.id===clientId)||null;
  if(!client)return null;
  const clientProjects=projects.filter(p=>p.client_id===client.id).sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at));
  const unlinkableProjects=projects.filter(p=>p.client_id!==client.id);
  async function linkProject(){
    if(!linkId)return;
    setLinking(true);
    await supabase.from("projects").update({client_id:client.id,updated_at:new Date().toISOString()}).eq("id",linkId);
    onLinkProject(linkId,client.id);
    setLinking(false);setShowLink(false);setLinkId("");
  }
  async function save(field,value){
    const updates={[field]:value||null,updated_at:new Date().toISOString()};
    await supabase.from("clients").update(updates).eq("id",client.id);
    setClients(prev=>prev.map(c=>c.id===client.id?{...c,...updates}:c));
  }
  async function deleteClient(){
    await supabase.from("clients").delete().eq("id",client.id);
    setClients(prev=>prev.filter(c=>c.id!==client.id));
    onBack();
  }
  const lastProject=clientProjects.length>0?new Date(Math.max(...clientProjects.map(p=>new Date(p.updated_at)))):null;
  const activeClientProject=clientProjects.find(p=>["Draft","In Progress","Review"].includes(p.status));
  const fStyle={width:"100%",border:"1px solid #e8e4dc",borderRadius:6,padding:"8px 12px",fontSize:13,fontFamily:"'Lora',serif",outline:"none",color:"#37352f",boxSizing:"border-box",background:"#fafaf9"};
  const lStyle={fontSize:10,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4};
  return(
    <div style={{minHeight:"100vh",background:"#fff"}}>
      <div style={{borderBottom:"1px solid #f1f0ef",padding:"12px 20px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <button onClick={onBack} style={{background:"none",border:"none",color:"#9b9a97",cursor:"pointer",fontSize:13,fontFamily:"'Lora',serif",display:"flex",alignItems:"center",gap:4}}>← Clients</button>
          <span style={{color:"#e8e4dc"}}>·</span>
          <span style={{fontSize:13,fontWeight:700,color:"#37352f"}}>{client.name}</span>
        </div>
        <button onClick={()=>setDeleteConfirm(true)} style={{background:"none",border:"1px solid #f1f0ef",padding:"6px 14px",borderRadius:6,fontSize:12,color:"#9b9a97",cursor:"pointer",fontFamily:"'Lora',serif"}} onMouseEnter={e=>{e.currentTarget.style.borderColor="#c0392b";e.currentTarget.style.color="#c0392b";}} onMouseLeave={e=>{e.currentTarget.style.borderColor="#f1f0ef";e.currentTarget.style.color="#9b9a97";}}>Delete</button>
      </div>
      {deleteConfirm&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:500}}>
          <div style={{background:"#fff",borderRadius:12,padding:"28px 32px",maxWidth:360,width:"90%",boxShadow:"0 8px 32px rgba(0,0,0,0.2)"}}>
            <div style={{fontSize:22,marginBottom:10}}>⚠️</div>
            <div style={{fontWeight:700,fontSize:16,color:"#37352f",marginBottom:8}}>Delete {client.name}?</div>
            <p style={{fontSize:13,color:"#9b9a97",lineHeight:1.65,marginBottom:20}}>This permanently deletes this client profile. Linked projects remain but will be unlinked.</p>
            <div style={{display:"flex",gap:8}}>
              <button onClick={deleteClient} style={{flex:1,background:"#c0392b",color:"#fff",border:"none",padding:"10px",borderRadius:6,fontFamily:"'Lora',serif",fontSize:13,cursor:"pointer"}}>Delete</button>
              <button onClick={()=>setDeleteConfirm(false)} style={{flex:1,background:"transparent",border:"1px solid #e8e4dc",padding:"9px",borderRadius:6,fontFamily:"'Lora',serif",fontSize:13,cursor:"pointer",color:"#37352f"}}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      <div style={{maxWidth:760,margin:"0 auto",padding:"40px 24px 80px"}}>
        <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:28}}>
          <div style={{width:64,height:64,borderRadius:16,background:"#37352f",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:700,fontSize:28,flexShrink:0}}>{(client.name||"?").charAt(0).toUpperCase()}</div>
          <div>
            <h1 style={{fontSize:28,fontWeight:700,color:"#37352f",letterSpacing:"-0.02em",margin:"0 0 4px"}}>{client.name}</h1>
            {(client.company||client.industry)&&<div style={{fontSize:14,color:"#9b9a97"}}>{[client.company,client.industry].filter(Boolean).join(" · ")}</div>}
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3, 1fr)",gap:12,marginBottom:28,minWidth:0}}>
          {[["Total Projects",clientProjects.length],["Last Activity",lastProject?lastProject.toLocaleDateString("en-US",{month:"short",year:"numeric"}):"—"],["Active Project",activeClientProject?activeClientProject.title:"—"]].map(([label,val])=>(
            <div key={label} style={{border:"1px solid #f1f0ef",borderRadius:10,padding:"12px 8px",background:"#fafaf9",textAlign:"center",minWidth:0,overflow:"hidden"}}>
              <div style={{fontSize:typeof val==="number"?22:12,fontWeight:700,color:"#37352f",marginBottom:4,lineHeight:1.3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{val}</div>
              <div style={{fontSize:10,color:"#9b9a97",fontFamily:"'IBM Plex Mono',monospace",textTransform:"uppercase",letterSpacing:"0.06em",whiteSpace:"nowrap"}}>{label}</div>
            </div>
          ))}
        </div>
        <div style={{border:"1px solid #f1f0ef",borderRadius:10,padding:"20px",marginBottom:28,background:"#fafaf9"}}>
          <div style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:16}}>Contact & Info</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
            {[["Name","name","Client name"],["Company","company","Company"],["Email","email","email@example.com"],["Phone","phone","+1 (555) 000-0000"],["Industry","industry","e.g. Music, Wedding…"],["How Found","how_found","Referral, Instagram, etc."]].map(([label,field,placeholder])=>(
              <div key={field}>
                <div style={lStyle}>{label}</div>
                <input key={client.id+field} defaultValue={client[field]||""} onFocus={e=>e.target.style.borderColor="#37352f"} onBlur={e=>{e.target.style.borderColor="#e8e4dc";if(e.target.value!==(client[field]||""))save(field,e.target.value);}} placeholder={placeholder} style={fStyle}/>
              </div>
            ))}
          </div>
          <div style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:12}}>Social</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
            {[["Instagram","instagram","@handle"],["TikTok","tiktok","@handle"],["YouTube","youtube","Channel URL"],["Website","website","https://"]].map(([label,field,placeholder])=>(
              <div key={field}>
                <div style={lStyle}>{label}</div>
                <input key={client.id+field} defaultValue={client[field]||""} onFocus={e=>e.target.style.borderColor="#37352f"} onBlur={e=>{e.target.style.borderColor="#e8e4dc";if(e.target.value!==(client[field]||""))save(field,e.target.value);}} placeholder={placeholder} style={fStyle}/>
              </div>
            ))}
          </div>
          <div style={lStyle}>Notes</div>
          <textarea key={client.id+"notes"} defaultValue={client.notes||""} onFocus={e=>e.target.style.borderColor="#37352f"} onBlur={e=>{e.target.style.borderColor="#e8e4dc";if(e.target.value!==(client.notes||""))save("notes",e.target.value);}} placeholder="Notes about this client…" rows={3} style={{...fStyle,resize:"vertical"}}/>
        </div>
        <div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:showLink?10:14,flexWrap:"wrap",gap:8}}>
            <div style={{fontSize:13,fontWeight:700,color:"#37352f"}}>Projects ({clientProjects.length})</div>
            <div style={{display:"flex",gap:8}}>
              {unlinkableProjects.length>0&&<button onClick={()=>{setShowLink(o=>!o);setLinkId("");}} style={{background:"transparent",border:"1px solid #e8e4dc",padding:"7px 14px",borderRadius:6,fontFamily:"'Lora',serif",fontSize:12,cursor:"pointer",color:"#9b9a97"}} onMouseEnter={e=>{e.currentTarget.style.borderColor="#37352f";e.currentTarget.style.color="#37352f";}} onMouseLeave={e=>{e.currentTarget.style.borderColor="#e8e4dc";e.currentTarget.style.color="#9b9a97";}}>🔗 Link existing</button>}
              <button onClick={onNewProject} style={{background:"#37352f",color:"#fff",border:"none",padding:"7px 14px",borderRadius:6,fontFamily:"'Lora',serif",fontSize:12,cursor:"pointer"}}>+ New Project</button>
            </div>
          </div>
          {showLink&&(
            <div style={{border:"1px solid #e8e4dc",borderRadius:8,padding:"14px",marginBottom:14,background:"#fafaf9"}}>
              <div style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>Link an existing project</div>
              <div style={{display:"flex",gap:8}}>
                <select value={linkId} onChange={e=>setLinkId(e.target.value)} style={{flex:1,border:"1px solid #e8e4dc",borderRadius:6,padding:"9px 12px",fontSize:13,fontFamily:"'Lora',serif",color:"#37352f",background:"#fff",outline:"none"}}>
                  <option value="">Select a project…</option>
                  {unlinkableProjects.map(p=><option key={p.id} value={p.id}>{p.brief?.coverEmoji||"🎬"} {p.title||"Untitled"}{p.client_id?` (currently linked to another client)`:""}</option>)}
                </select>
                <button onClick={linkProject} disabled={!linkId||linking} style={{background:"#37352f",color:"#fff",border:"none",padding:"9px 16px",borderRadius:6,fontFamily:"'Lora',serif",fontSize:12,cursor:linkId&&!linking?"pointer":"not-allowed",opacity:linkId&&!linking?1:0.5,whiteSpace:"nowrap"}}>{linking?"Linking…":"Link"}</button>
                <button onClick={()=>{setShowLink(false);setLinkId("");}} style={{background:"transparent",border:"1px solid #e8e4dc",padding:"8px 12px",borderRadius:6,fontFamily:"'Lora',serif",fontSize:12,cursor:"pointer",color:"#9b9a97"}}>✕</button>
              </div>
            </div>
          )}
          {clientProjects.length===0&&!showLink?(
            <div style={{textAlign:"center",padding:"32px 20px",border:"1px dashed #e8e4dc",borderRadius:10}}>
              <p style={{fontSize:13,color:"#9b9a97",marginBottom:10}}>No projects linked to this client yet.</p>
              <div style={{display:"flex",gap:8,justifyContent:"center"}}>
                {unlinkableProjects.length>0&&<button onClick={()=>setShowLink(true)} style={{background:"transparent",border:"1px solid #e8e4dc",padding:"7px 16px",borderRadius:6,fontFamily:"'Lora',serif",fontSize:12,cursor:"pointer",color:"#9b9a97"}}>🔗 Link existing</button>}
                <button onClick={onNewProject} style={{background:"transparent",border:"1px solid #e8e4dc",padding:"7px 16px",borderRadius:6,fontFamily:"'Lora',serif",fontSize:12,cursor:"pointer",color:"#9b9a97"}}>+ Create new project</button>
              </div>
            </div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {clientProjects.map(p=>(
                <div key={p.id} onClick={()=>onOpenProject(p)} style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",border:"1px solid #f1f0ef",borderRadius:8,background:"#fafaf9",cursor:"pointer",transition:"background .12s"}} onMouseEnter={e=>e.currentTarget.style.background="#f0ede8"} onMouseLeave={e=>e.currentTarget.style.background="#fafaf9"}>
                  <span style={{fontSize:22,flexShrink:0}}>{p.brief?.coverEmoji||"🎬"}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:600,fontSize:14,color:"#37352f",marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.title||"Untitled"}</div>
                    <div style={{fontSize:12,color:"#9b9a97"}}>{[p.brief?.projectType,p.brief?.date].filter(Boolean).join(" · ")}</div>
                  </div>
                  <StatusBadge status={p.status} readonly/>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── MEETING STAGE CONSTANTS ──────────────────────────────────────────────────
const STAGES=[{id:"discovery",label:"Discovery",emoji:"🔍"},{id:"consultation",label:"Consultation",emoji:"💬"},{id:"shoot_day",label:"Shoot Day",emoji:"🎬"},{id:"post_production",label:"Post Production",emoji:"✂️"}];
const STAGE_COLORS={discovery:{bg:"#e8f0fe",c:"#1a56c4"},consultation:{bg:"#fdeee4",c:"#b94a1a"},shoot_day:{bg:"#e6f4ea",c:"#1e7e34"},post_production:{bg:"#f1f0ef",c:"#55534e"}};

// ─── STAGE PROGRESS BAR ───────────────────────────────────────────────────────
function StageProgressBar({stage,meetingHistory,onMeetingClick}){
  const currentIdx=STAGES.findIndex(s=>s.id===stage);
  return(
    <div style={{padding:"12px 20px",borderBottom:"1px solid #f1f0ef",background:"#fafaf9",display:"flex",alignItems:"center",gap:0,overflowX:"auto"}}>
      {STAGES.map((s,i)=>{
        const done=i<currentIdx;
        const active=i===currentIdx;
        const pending=i>currentIdx;
        const meeting=arr(meetingHistory).filter(m=>m.stage===s.id).slice(-1)[0];
        const sc=STAGE_COLORS[s.id];
        return(
          <React.Fragment key={s.id}>
            <div onClick={()=>{if((done||active)&&meeting&&onMeetingClick)onMeetingClick(meeting);}} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,cursor:(done||active)&&meeting?"pointer":"default",minWidth:80,flexShrink:0}}>
              <div style={{width:32,height:32,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,background:done?"#37352f":active?sc.bg:"#f1f0ef",color:done?"#fff":active?sc.c:"#c4c3bf",border:active?`2px solid ${sc.c}`:"2px solid transparent",transition:"all .2s"}}>
                {done?"✓":s.emoji}
              </div>
              <div style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:done?"#37352f":active?sc.c:"#c4c3bf",fontWeight:active?700:400,whiteSpace:"nowrap"}}>{s.label}</div>
              {(done||active)&&meeting&&<div style={{fontSize:9,color:"#c4c3bf",fontFamily:"'IBM Plex Mono',monospace"}}>{new Date(meeting.date).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</div>}
            </div>
            {i<STAGES.length-1&&<div style={{flex:1,height:2,background:done?"#37352f":"#f1f0ef",minWidth:16,transition:"background .3s",margin:"0 2px",marginBottom:20}}/>}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── MEETING NOTES PAGE ───────────────────────────────────────────────────────
// Parse transcript text into speaker segments with optional timestamps
function parseTranscript(text){
  if(!text)return[];
  const lines=text.split("\n").filter(l=>l.trim());
  const segments=[];
  for(const line of lines){
    // Match: optional [mm:ss] or (mm:ss) prefix, then "Speaker Name: text"
    const m=line.match(/^(?:\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s+)?([^:]{2,40}):\s*(.+)$/);
    if(m){
      segments.push({timestamp:m[1]||null,speaker:m[2].trim(),text:m[3].trim()});
    } else {
      // Continuation or plain line — append to last segment or add as plain
      if(segments.length>0&&!line.match(/^\[?\d{1,2}:\d{2}/)){
        segments[segments.length-1].text+=" "+line.trim();
      } else {
        segments.push({timestamp:null,speaker:null,text:line.trim()});
      }
    }
  }
  return segments;
}

// Convert raw field paths to readable labels: clientActionItems → Client Action Items
function formatFieldName(field){
  if(!field)return"Update";
  return field
    .replace(/\[(\d+)\]/g,"[$1]")
    .replace(/\.([a-z])/g,(m,c)=>" → "+c.toUpperCase())
    .replace(/([A-Z])/g," $1")
    .replace(/\[(\d+)\]/g," $1")
    .replace(/^\w/,c=>c.toUpperCase())
    .replace(/\s+/g," ")
    .trim();
}

function MeetingNotesPanel({meeting,fullTranscript,label,expanded,onToggleExpand,onClose,onApply,onDismiss,onRegenerate,projectId,projects,onMove}){
  const[tab,setTab]=useState("notes");
  const[regenerating,setRegenerating]=useState(false);
  const[regenError,setRegenError]=useState(null);
  const[moveOpen,setMoveOpen]=useState(false);
  const[moving,setMoving]=useState(false);
  const isPending=meeting?.status==="pending_review";
  const changes=arr(meeting?.suggestedChanges);
  const[selected,setSelected]=useState(()=>changes.map((_,i)=>i));
  // Reset selection and regen state when meeting changes
  React.useEffect(()=>{setSelected(arr(meeting?.suggestedChanges).map((_,i)=>i));setRegenError(null);setMoveOpen(false);},[meeting?.id]);

  async function handleMove(targetProjectId){
    if(!onMove||moving)return;
    setMoving(true);
    try{ await onMove(meeting,targetProjectId); }
    catch(e){ console.error("move failed",e); }
    finally{ setMoving(false);setMoveOpen(false); }
  }
  if(!meeting)return null;
  const sc=STAGE_COLORS[meeting.stage]||STAGE_COLORS.discovery;
  const segments=parseTranscript(fullTranscript||meeting.transcriptText||meeting.transcriptExcerpt||"");
  function toggleChange(i){setSelected(prev=>prev.includes(i)?prev.filter(x=>x!==i):[...prev,i]);}
  async function handleRegenerate(){
    if(!projectId||regenerating)return;
    setRegenerating(true);setRegenError(null);
    try{
      const res=await fetch(`/api/recall-webhook?action=reanalyze-meeting`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({projectId,meetingId:meeting.id})});
      const data=await res.json();
      if(!res.ok||!data.ok)throw new Error(data.error||"Reanalysis failed");
      if(onRegenerate)onRegenerate(data.meeting);
    }catch(e){setRegenError(e.message);}finally{setRegenerating(false);}
  }

  const panelStyle=expanded
    ?{position:"fixed",inset:0,zIndex:300,background:"#fff",display:"flex",flexDirection:"column",overflow:"hidden"}
    :{width:400,borderLeft:"1px solid #f1f0ef",display:"flex",flexDirection:"column",flexShrink:0,overflow:"hidden",background:"#fff"};

  const NotesContent=()=>(
    <div style={{flex:1,overflowY:"auto",padding:"20px 22px"}}>
      {/* Summary */}
      <div style={{marginBottom:24}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:13}}>✦</span>
            <span style={{fontSize:12,fontWeight:700,color:"#37352f"}}>Summary</span>
          </div>
          {onRegenerate&&<button onClick={handleRegenerate} disabled={regenerating} style={{background:"none",border:"1px solid #e8e4dc",borderRadius:5,padding:"3px 8px",cursor:regenerating?"default":"pointer",fontSize:11,color:regenerating?"#c4c3bf":"#9b9a97",lineHeight:1,fontFamily:"'IBM Plex Mono',monospace",flexShrink:0}} onMouseEnter={e=>{if(!regenerating)e.currentTarget.style.borderColor="#37352f";}} onMouseLeave={e=>e.currentTarget.style.borderColor="#e8e4dc"}>{regenerating?"…":"↻ Regenerate"}</button>}
        </div>
        {regenError&&<div style={{fontSize:11,color:"#c0392b",background:"#fff2f2",border:"1px solid #fcc",borderRadius:5,padding:"6px 10px",marginBottom:8}}>{regenError}</div>}
        {regenerating&&<div style={{fontSize:12,color:"#9b9a97",display:"flex",alignItems:"center",gap:6,marginBottom:8}}><span className="spin" style={{display:"inline-block",fontSize:13}}>⟳</span> Re-analyzing…</div>}
        {meeting.summary&&<p style={{fontSize:13,color:"#37352f",lineHeight:1.85,background:"#fafaf9",borderRadius:8,padding:"14px 16px",margin:0}}>{meeting.summary}</p>}
      </div>
      {/* Key Points */}
      {arr(meeting.keyPoints).length>0&&(
        <div style={{marginBottom:24}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}>
            <span style={{fontSize:13}}>☑</span>
            <span style={{fontSize:12,fontWeight:700,color:"#37352f"}}>Key Points</span>
          </div>
          {arr(meeting.keyPoints).map((p,i)=>(
            <div key={i} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 14px",background:"#fff",border:"1px solid #f1f0ef",borderRadius:8,marginBottom:8}}>
              <span style={{width:20,height:20,borderRadius:4,background:"#e8f0fe",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"#1a56c4",flexShrink:0,marginTop:1,fontWeight:700}}>·</span>
              <span style={{fontSize:13,color:"#37352f",lineHeight:1.7,flex:1}}>{p}</span>
            </div>
          ))}
        </div>
      )}
      {/* Brief changes — interactive when pending, read-only when reviewed */}
      {changes.length>0&&(
        <div style={{marginBottom:8}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:13}}>✎</span>
              <span style={{fontSize:12,fontWeight:700,color:"#37352f"}}>Brief Changes</span>
            </div>
            {isPending&&<span style={{fontSize:10,fontFamily:"'IBM Plex Mono',monospace",background:"#fdeee4",color:"#b94a1a",borderRadius:20,padding:"2px 8px",fontWeight:600}}>PENDING REVIEW</span>}
          </div>
          {changes.map((c,i)=>{
            const reviewed=meeting.status==="reviewed";
            const applied=reviewed&&c.applied!==false;
            const skipped=reviewed&&c.applied===false;
            const sel=isPending&&selected.includes(i);
            return(
              <div key={i}
                onClick={isPending?()=>toggleChange(i):undefined}
                style={{padding:"14px 16px",borderRadius:10,marginBottom:12,border:`1.5px solid ${isPending?(sel?"#1a56c4":"#e8e4dc"):skipped?"#f1f0ef":applied?"#b7e4c7":"#f1f0ef"}`,background:isPending?(sel?"#f5f8ff":"#fff"):skipped?"#f7f6f3":applied?"#f0faf4":"#fff",cursor:isPending?"pointer":"default",transition:"all .15s"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                  {isPending&&(
                    <div style={{width:16,height:16,borderRadius:4,border:`2px solid ${sel?"#1a56c4":"#d4d2ce"}`,background:sel?"#1a56c4":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      {sel&&<span style={{color:"#fff",fontSize:10,lineHeight:1}}>✓</span>}
                    </div>
                  )}
                  <span style={{fontSize:10,fontFamily:"'IBM Plex Mono',monospace",background:skipped?"#f1f0ef":applied?"#d1f0dc":isPending?"#e8f0fe":"#e8f0fe",color:skipped?"#9b9a97":applied?"#1e7e34":"#1a56c4",borderRadius:6,padding:"3px 8px",fontWeight:600,letterSpacing:"0.04em",maxWidth:"100%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{formatFieldName(c.field)}</span>
                  {reviewed&&<span style={{fontSize:10,color:skipped?"#c4c3bf":"#1e7e34",fontFamily:"'IBM Plex Mono',monospace",flexShrink:0}}>{skipped?"skipped":"✓ applied"}</span>}
                </div>
                <div style={{fontSize:13,color:"#37352f",lineHeight:1.65,overflowWrap:"break-word",marginBottom:c.before&&c.after?10:0}}>{c.description}</div>
                {c.before&&c.after&&(
                  <div style={{display:"flex",flexDirection:"column",gap:4}}>
                    <div style={{fontSize:11,color:"#c0392b",fontFamily:"'IBM Plex Mono',monospace",background:"#fff2f2",borderRadius:6,padding:"6px 10px",overflowWrap:"break-word",whiteSpace:"pre-wrap",lineHeight:1.6}}>– {c.before}</div>
                    <div style={{fontSize:11,color:"#1e7e34",fontFamily:"'IBM Plex Mono',monospace",background:"#e6f4ea",borderRadius:6,padding:"6px 10px",overflowWrap:"break-word",whiteSpace:"pre-wrap",lineHeight:1.6}}>+ {c.after}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const TranscriptContent=()=>(
    <div style={{flex:1,overflowY:"auto",padding:"20px 22px"}}>
      {segments.length===0?(
        <div style={{textAlign:"center",padding:"40px 0",color:"#9b9a97",fontSize:13,fontStyle:"italic"}}>No transcript available for this meeting.</div>
      ):(
        <div>
          {segments.map((seg,i)=>{
            if(!seg.speaker){
              return <div key={i} style={{fontSize:13,color:"#9b9a97",lineHeight:1.7,marginBottom:8,fontStyle:"italic"}}>{seg.text}</div>;
            }
            const showHeader=i===0||segments[i-1].speaker!==seg.speaker;
            return(
              <div key={i} style={{marginBottom:showHeader?16:5}}>
                {showHeader&&(
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
                    <span style={{fontSize:11,fontWeight:700,color:"#37352f",fontFamily:"'IBM Plex Mono',monospace",textTransform:"uppercase",letterSpacing:"0.06em"}}>{seg.speaker}</span>
                    {seg.timestamp&&<span style={{fontSize:10,background:"#f1f0ef",color:"#9b9a97",borderRadius:4,padding:"2px 7px",fontFamily:"'IBM Plex Mono',monospace"}}>{seg.timestamp}</span>}
                  </div>
                )}
                <div style={{fontSize:13,color:"#37352f",lineHeight:1.8}}>{seg.text}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return(
    <div style={panelStyle} className={expanded?"":"hide-on-mobile"}>
      {/* Header */}
      <div style={{padding:"14px 16px 0",borderBottom:"1px solid #f1f0ef",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <div style={{display:"flex",alignItems:"center",gap:6,minWidth:0}}>
            <span style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",background:sc.bg,color:sc.c,borderRadius:20,padding:"2px 8px",fontWeight:600,textTransform:"uppercase",flexShrink:0}}>{label||(meeting.stage||"").replace("_"," ")}</span>
            <span style={{fontSize:11,color:"#c4c3bf",fontFamily:"'IBM Plex Mono',monospace",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{new Date(meeting.date).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</span>
          </div>
          <div style={{display:"flex",gap:4,flexShrink:0,alignItems:"center",position:"relative"}}>
            {onMove&&arr(projects).filter(p=>p.id!==projectId).length>0&&(
              <div style={{position:"relative"}}>
                <button onClick={()=>setMoveOpen(o=>!o)} title="Move to another project" style={{background:moveOpen?"#37352f":"none",color:moveOpen?"#fff":"#9b9a97",border:"1px solid #e8e4dc",borderRadius:5,padding:"3px 8px",cursor:"pointer",fontSize:11,lineHeight:1,fontFamily:"'IBM Plex Mono',monospace"}} onMouseEnter={e=>{if(!moveOpen){e.currentTarget.style.borderColor="#37352f";e.currentTarget.style.color="#37352f";}}} onMouseLeave={e=>{if(!moveOpen){e.currentTarget.style.borderColor="#e8e4dc";e.currentTarget.style.color="#9b9a97";}}}>{moving?"…":"↗ Move"}</button>
                {moveOpen&&(
                  <>
                    <div style={{position:"fixed",inset:0,zIndex:299}} onClick={()=>setMoveOpen(false)}/>
                    <div style={{position:"fixed",top:48,right:8,left:8,background:"#fff",border:"1px solid #e8e4dc",borderRadius:10,boxShadow:"0 8px 24px rgba(0,0,0,0.15)",zIndex:310,maxHeight:"60vh",overflowY:"auto"}}>
                      <div style={{padding:"10px 14px 6px",fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.08em",borderBottom:"1px solid #f1f0ef"}}>Move to project</div>
                      {arr(projects).filter(p=>p.id!==projectId).map(p=>(
                        <button key={p.id} onClick={()=>handleMove(p.id)} style={{display:"block",width:"100%",textAlign:"left",padding:"11px 14px",border:"none",borderBottom:"1px solid #f7f6f3",background:"none",cursor:"pointer",fontSize:13,color:"#37352f",fontFamily:"'Lora',serif"}} onMouseEnter={e=>e.currentTarget.style.background="#f7f6f3"} onMouseLeave={e=>e.currentTarget.style.background="none"}>
                          <div style={{fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.title||p.brief?.projectTitle||"Untitled"}</div>
                          {p.client_name&&<div style={{fontSize:11,color:"#9b9a97",marginTop:2}}>{p.client_name}</div>}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            <button onClick={onToggleExpand} title={expanded?"Collapse":"Expand"} style={{background:"none",border:"1px solid #e8e4dc",borderRadius:5,padding:"3px 7px",cursor:"pointer",fontSize:12,color:"#9b9a97",lineHeight:1}} onMouseEnter={e=>e.currentTarget.style.borderColor="#37352f"} onMouseLeave={e=>e.currentTarget.style.borderColor="#e8e4dc"}>{expanded?"⊡":"⊞"}</button>
            <button onClick={onClose} style={{background:"none",border:"none",fontSize:16,cursor:"pointer",color:"#9b9a97",padding:"2px 4px",lineHeight:1}}>✕</button>
          </div>
        </div>
          <div style={{display:"flex"}}>
          {[["notes","Notes"],["transcript","Transcript"]].map(([t,l])=>(
            <button key={t} onClick={()=>setTab(t)} style={{padding:"6px 14px",border:"none",background:"none",cursor:"pointer",fontSize:12,fontFamily:"'Lora',serif",color:tab===t?"#37352f":"#9b9a97",fontWeight:tab===t?700:400,borderBottom:tab===t?"2px solid #37352f":"2px solid transparent",marginBottom:-1,transition:"all .15s"}}>{l}</button>
          ))}
        </div>
      </div>
      {tab==="notes"?<NotesContent/>:<TranscriptContent/>}
      {/* Apply/Dismiss footer — only shown when pending and on notes tab */}
      {isPending&&tab==="notes"&&onApply&&(
        <div style={{padding:"12px 16px",borderTop:"1px solid #f1f0ef",display:"flex",gap:8,flexShrink:0,background:"#fafaf9"}}>
          <button onClick={()=>onApply(changes.map((_,i)=>i))} style={{flex:1,background:"#37352f",color:"#fff",border:"none",padding:"9px 14px",borderRadius:6,fontFamily:"'Lora',serif",fontSize:12,cursor:"pointer",fontWeight:600}}>Apply All</button>
          {selected.length>0&&selected.length<changes.length&&(
            <button onClick={()=>onApply(selected)} style={{flex:1,background:"#1a56c4",color:"#fff",border:"none",padding:"9px 14px",borderRadius:6,fontFamily:"'Lora',serif",fontSize:12,cursor:"pointer",fontWeight:600}}>Apply {selected.length}</button>
          )}
          <button onClick={onDismiss} style={{padding:"9px 12px",border:"1px solid #e8e4dc",borderRadius:6,fontFamily:"'Lora',serif",fontSize:12,cursor:"pointer",color:"#9b9a97",background:"transparent"}}>Dismiss</button>
        </div>
      )}
    </div>
  );
}

// ─── SUGGESTED CHANGES MODAL ──────────────────────────────────────────────────
function SuggestedChangesModal({meeting,currentBrief,onApply,onDismiss}){
  const[selected,setSelected]=useState(()=>arr(meeting?.suggestedChanges).map((_,i)=>i));
  if(!meeting)return null;
  const changes=arr(meeting.suggestedChanges);
  const sc=STAGE_COLORS[meeting.stage]||STAGE_COLORS.consultation;
  function toggle(i){setSelected(prev=>prev.includes(i)?prev.filter(x=>x!==i):[...prev,i]);}
  return(
    <div style={{position:"fixed",inset:0,zIndex:400,display:"flex",justifyContent:"flex-end"}} onClick={onDismiss}>
      <div onClick={e=>e.stopPropagation()} style={{width:"min(520px,100vw)",background:"#fff",boxShadow:"-4px 0 24px rgba(0,0,0,0.12)",display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{padding:"20px 24px 16px",borderBottom:"1px solid #f1f0ef",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
            <span style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",background:sc.bg,color:sc.c,borderRadius:20,padding:"2px 10px",fontWeight:600,textTransform:"uppercase"}}>{meeting.stage?.replace("_"," ")} · {new Date(meeting.date).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>
            <button onClick={onDismiss} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#9b9a97",padding:4,flexShrink:0}}>✕</button>
          </div>
          <div style={{fontSize:18,fontWeight:700,color:"#37352f",marginBottom:4}}>Review Meeting Changes</div>
          <div style={{fontSize:13,color:"#9b9a97",lineHeight:1.6,overflowWrap:"break-word"}}>{meeting.summary}</div>
        </div>
        {arr(meeting.keyPoints).length>0&&(
          <div style={{padding:"12px 24px",borderBottom:"1px solid #f1f0ef",background:"#fafaf9",flexShrink:0}}>
            <div style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:"#c4c3bf",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>Key Points</div>
            {arr(meeting.keyPoints).map((p,i)=><div key={i} style={{fontSize:12,color:"#37352f",lineHeight:1.7,display:"flex",gap:6,overflowWrap:"break-word"}}><span style={{color:"#e97942",flexShrink:0}}>•</span><span>{p}</span></div>)}
          </div>
        )}
        <div style={{flex:1,overflowY:"auto",overflowX:"hidden",padding:"16px 24px"}}>
          <div style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:"#c4c3bf",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12}}>Suggested Changes ({changes.length})</div>
          {changes.length===0&&<div style={{fontSize:13,color:"#9b9a97",fontStyle:"italic"}}>No specific field changes suggested.</div>}
          {changes.map((c,i)=>{
            const checked=selected.includes(i);
            return(
              <div key={i} onClick={()=>toggle(i)} style={{padding:"12px 14px",border:`1px solid ${checked?"#1a56c4":"#f1f0ef"}`,borderRadius:8,marginBottom:8,cursor:"pointer",background:checked?"#f0f5ff":"#fff",transition:"all .15s",minWidth:0}}>
                <div style={{display:"flex",alignItems:"flex-start",gap:10,minWidth:0}}>
                  <div style={{width:18,height:18,borderRadius:4,border:`2px solid ${checked?"#1a56c4":"#d4d2ce"}`,background:checked?"#1a56c4":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}>
                    {checked&&<span style={{color:"#fff",fontSize:11,lineHeight:1}}>✓</span>}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:3}}>{c.field||"Update"}</div>
                    <div style={{fontSize:13,color:"#37352f",lineHeight:1.6,overflowWrap:"break-word"}}>{c.description}</div>
                    {c.before&&c.after&&(
                      <div style={{marginTop:8,display:"flex",gap:8,minWidth:0}}>
                        <div style={{flex:1,minWidth:0,padding:"6px 10px",background:"#fff2f2",borderRadius:4,fontSize:11,color:"#c0392b",lineHeight:1.5,fontFamily:"'IBM Plex Mono',monospace",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={c.before}>– {c.before}</div>
                        <div style={{flex:1,minWidth:0,padding:"6px 10px",background:"#e6f4ea",borderRadius:4,fontSize:11,color:"#1e7e34",lineHeight:1.5,fontFamily:"'IBM Plex Mono',monospace",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={c.after}>+ {c.after}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{padding:"16px 24px",borderTop:"1px solid #f1f0ef",display:"flex",gap:8,flexShrink:0}}>
          <button onClick={()=>onApply(changes.map((_,i)=>i))} style={{flex:1,background:"#37352f",color:"#fff",border:"none",padding:"10px 16px",borderRadius:6,fontFamily:"'Lora',serif",fontSize:13,cursor:"pointer",fontWeight:600}}>Apply All</button>
          {selected.length>0&&selected.length<changes.length&&<button onClick={()=>onApply(selected)} style={{flex:1,background:"#1a56c4",color:"#fff",border:"none",padding:"10px 16px",borderRadius:6,fontFamily:"'Lora',serif",fontSize:13,cursor:"pointer",fontWeight:600}}>Apply Selected ({selected.length})</button>}
          <button onClick={onDismiss} style={{padding:"10px 16px",border:"1px solid #f1f0ef",borderRadius:6,fontFamily:"'Lora',serif",fontSize:13,cursor:"pointer",color:"#9b9a97",background:"transparent"}}>Dismiss</button>
        </div>
      </div>
    </div>
  );
}

// ─── CALL SHEET PANEL ─────────────────────────────────────────────────────────
function CallSheetPanel({brief,callSheet,onUpdate,readonly}){
  const cs=obj(callSheet);
  const[generating,setGenerating]=useState(false);
  const[errMsg,setErrMsg]=useState("");
  const setCS=(field,val)=>onUpdate({...cs,[field]:val});

  async function generate(){
    setGenerating(true);setErrMsg("");
    try{
      const system=`You are a production coordinator. Generate a detailed call sheet from this production brief. Return ONLY valid JSON, no markdown:
{"callTime":"","date":"","location":"","schedule":[{"time":"","activity":"","notes":""}],"contactInfo":[{"name":"","role":"","phone":""}],"equipment":[""],"crewAssignments":[{"name":"","role":"","callTime":""}],"directorNotes":"","clientInstructions":""}`;
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","anthropic-dangerous-direct-browser-access":"true","x-api-key":API_KEY,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:MODEL,max_tokens:4000,system,messages:[{role:"user",content:`Generate a call sheet for this production:\n${JSON.stringify(brief)}`}]})});
      const data=await res.json();
      const raw=(data.content||[]).map(b=>b.text||"").join("").trim();
      const s=raw.indexOf("{"),e=raw.lastIndexOf("}");
      if(s!==-1&&e!==-1){const parsed=JSON.parse(raw.slice(s,e+1));onUpdate(parsed);}
      else setErrMsg("Could not parse call sheet response.");
    }catch(err){setErrMsg(err.message);}
    setGenerating(false);
  }

  if(!cs.callTime&&!cs.date&&!cs.location&&!readonly){
    return(
      <div style={{maxWidth:700,margin:"0 auto",padding:"40px 24px"}}>
        <div style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:"#c4c3bf",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:12}}>Shoot Day</div>
        <h2 style={{fontSize:24,fontWeight:700,color:"#37352f",marginBottom:8}}>Call Sheet</h2>
        <p style={{fontSize:14,color:"#9b9a97",marginBottom:32,lineHeight:1.7}}>Generate a call sheet from your brief — schedule, crew assignments, equipment list, and client instructions.</p>
        {errMsg&&<div style={{background:"#fff2f2",border:"1px solid #ffc9c9",borderRadius:8,padding:"12px 16px",marginBottom:16,fontSize:13,color:"#c0392b"}}>{errMsg}</div>}
        <button onClick={generate} disabled={generating} style={{background:"#37352f",color:"#fff",border:"none",padding:"12px 28px",borderRadius:6,fontFamily:"'Lora',serif",fontSize:14,cursor:generating?"not-allowed":"pointer",display:"flex",alignItems:"center",gap:8,opacity:generating?0.7:1}}>
          {generating&&<div className="spin" style={{width:14,height:14,border:"2px solid rgba(255,255,255,0.3)",borderTop:"2px solid #fff",borderRadius:"50%"}}/>}
          {generating?"Generating…":"✦ Generate Call Sheet"}
        </button>
      </div>
    );
  }

  const Editable2=({value,onChange,multiline,placeholder,style={}})=>{
    const[editing,setEditing]=useState(false);
    const[val,setVal]=useState(value||"");
    useEffect(()=>setVal(value||""),[value]);
    if(readonly||!editing)return<span onClick={()=>{if(!readonly)setEditing(true);}} style={{cursor:readonly?"default":"text",minHeight:20,display:"block",...style}}>{val||<span style={{color:"#c4c3bf",fontStyle:"italic"}}>{placeholder||"Click to edit"}</span>}</span>;
    if(multiline)return<textarea value={val} onChange={e=>setVal(e.target.value)} onBlur={()=>{onChange(val);setEditing(false);}} autoFocus style={{width:"100%",border:"none",outline:"none",resize:"vertical",background:"transparent",fontFamily:"'Lora',serif",fontSize:"inherit",color:"#37352f",lineHeight:1.7,...style}}/>;
    return<input value={val} onChange={e=>setVal(e.target.value)} onBlur={()=>{onChange(val);setEditing(false);}} autoFocus style={{border:"none",outline:"none",background:"transparent",fontFamily:"'Lora',serif",fontSize:"inherit",color:"#37352f",width:"100%",...style}}/>;
  };

  return(
    <div style={{maxWidth:700,margin:"0 auto",padding:"32px 24px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24}}>
        <div>
          <div style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:"#c4c3bf",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:4}}>Shoot Day</div>
          <h2 style={{fontSize:22,fontWeight:700,color:"#37352f"}}>Call Sheet</h2>
        </div>
        {!readonly&&<button onClick={generate} disabled={generating} style={{border:"1px solid #e8e4dc",padding:"7px 14px",borderRadius:6,fontSize:12,color:"#9b9a97",background:"transparent",cursor:"pointer",fontFamily:"'Lora',serif",display:"flex",alignItems:"center",gap:6}} onMouseEnter={e=>{e.currentTarget.style.borderColor="#37352f";e.currentTarget.style.color="#37352f";}} onMouseLeave={e=>{e.currentTarget.style.borderColor="#e8e4dc";e.currentTarget.style.color="#9b9a97";}}>{generating?<><div className="spin" style={{width:12,height:12,border:"2px solid #ccc",borderTop:"2px solid #37352f",borderRadius:"50%"}}/> Regenerating…</>:"↺ Regenerate"}</button>}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16,marginBottom:24,padding:"16px",background:"#fafaf9",borderRadius:10,border:"1px solid #f1f0ef"}}>
        {[["Date","date"],["Call Time","callTime"],["Location","location"]].map(([label,field])=>(
          <div key={field}>
            <div style={{fontSize:10,fontFamily:"'IBM Plex Mono',monospace",color:"#c4c3bf",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4}}>{label}</div>
            <Editable2 value={cs[field]} onChange={v=>setCS(field,v)} placeholder={`Add ${label.toLowerCase()}`} style={{fontSize:14,fontWeight:600,color:"#37352f"}}/>
          </div>
        ))}
      </div>

      {arr(cs.schedule).length>0&&(
        <div style={{marginBottom:24}}>
          <div style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10}}>Schedule</div>
          {arr(cs.schedule).map((item,i)=>(
            <div key={i} style={{display:"grid",gridTemplateColumns:"80px 1fr 1fr",gap:10,padding:"8px 0",borderBottom:"1px solid #f7f6f3",alignItems:"start"}}>
              <Editable2 value={item.time} onChange={v=>{const s=[...cs.schedule];s[i]={...s[i],time:v};setCS("schedule",s);}} style={{fontSize:12,fontFamily:"'IBM Plex Mono',monospace",color:"#e97942",fontWeight:500}}/>
              <Editable2 value={item.activity} onChange={v=>{const s=[...cs.schedule];s[i]={...s[i],activity:v};setCS("schedule",s);}} style={{fontSize:13,color:"#37352f",fontWeight:600}}/>
              <Editable2 value={item.notes} onChange={v=>{const s=[...cs.schedule];s[i]={...s[i],notes:v};setCS("schedule",s);}} style={{fontSize:12,color:"#9b9a97"}} placeholder="Notes"/>
            </div>
          ))}
        </div>
      )}

      {!readonly&&arr(cs.crewAssignments).length>0&&(
        <div style={{marginBottom:24}}>
          <div style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10}}>Crew Assignments <span style={{fontSize:9,background:"#f1f0ef",color:"#9b9a97",borderRadius:4,padding:"1px 6px",marginLeft:6}}>Internal</span></div>
          {arr(cs.crewAssignments).map((item,i)=>(
            <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 1fr 80px",gap:10,padding:"8px 0",borderBottom:"1px solid #f7f6f3",alignItems:"start"}}>
              <Editable2 value={item.name} onChange={v=>{const a=[...cs.crewAssignments];a[i]={...a[i],name:v};setCS("crewAssignments",a);}} style={{fontSize:13,fontWeight:600,color:"#37352f"}}/>
              <Editable2 value={item.role} onChange={v=>{const a=[...cs.crewAssignments];a[i]={...a[i],role:v};setCS("crewAssignments",a);}} style={{fontSize:12,color:"#9b9a97"}}/>
              <Editable2 value={item.callTime} onChange={v=>{const a=[...cs.crewAssignments];a[i]={...a[i],callTime:v};setCS("crewAssignments",a);}} style={{fontSize:12,fontFamily:"'IBM Plex Mono',monospace",color:"#e97942"}}/>
            </div>
          ))}
        </div>
      )}

      {!readonly&&arr(cs.equipment).length>0&&(
        <div style={{marginBottom:24}}>
          <div style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10}}>Equipment <span style={{fontSize:9,background:"#f1f0ef",color:"#9b9a97",borderRadius:4,padding:"1px 6px",marginLeft:6}}>Internal</span></div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {arr(cs.equipment).map((eq,i)=><span key={i} style={{fontSize:12,background:"#f7f6f3",border:"1px solid #f1f0ef",borderRadius:20,padding:"4px 10px",color:"#37352f"}}>{eq}</span>)}
          </div>
        </div>
      )}

      {arr(cs.contactInfo).length>0&&(
        <div style={{marginBottom:24}}>
          <div style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10}}>Key Contacts</div>
          {arr(cs.contactInfo).map((c,i)=>(
            <div key={i} style={{display:"flex",gap:12,padding:"8px 0",borderBottom:"1px solid #f7f6f3",alignItems:"center"}}>
              <div style={{flex:1}}><Editable2 value={c.name} onChange={v=>{const a=[...cs.contactInfo];a[i]={...a[i],name:v};setCS("contactInfo",a);}} style={{fontSize:13,fontWeight:600,color:"#37352f"}}/></div>
              <div style={{flex:1}}><Editable2 value={c.role} onChange={v=>{const a=[...cs.contactInfo];a[i]={...a[i],role:v};setCS("contactInfo",a);}} style={{fontSize:12,color:"#9b9a97"}}/></div>
              <div style={{flex:1}}><Editable2 value={c.phone} onChange={v=>{const a=[...cs.contactInfo];a[i]={...a[i],phone:v};setCS("contactInfo",a);}} style={{fontSize:12,fontFamily:"'IBM Plex Mono',monospace",color:"#37352f"}}/></div>
            </div>
          ))}
        </div>
      )}

      {cs.clientInstructions&&(
        <div style={{marginBottom:24,padding:"16px",background:"#e8f0fe",borderRadius:10,border:"1px solid #d2e3fc"}}>
          <div style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:"#1a56c4",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>Client Instructions</div>
          <Editable2 value={cs.clientInstructions} onChange={v=>setCS("clientInstructions",v)} multiline style={{fontSize:13,color:"#37352f",lineHeight:1.7}}/>
        </div>
      )}

      {!readonly&&cs.directorNotes&&(
        <div style={{padding:"16px",background:"#fafaf9",borderRadius:10,border:"1px solid #f1f0ef"}}>
          <div style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>Director Notes <span style={{fontSize:9,background:"#f1f0ef",color:"#9b9a97",borderRadius:4,padding:"1px 6px",marginLeft:6}}>Internal</span></div>
          <Editable2 value={cs.directorNotes} onChange={v=>setCS("directorNotes",v)} multiline style={{fontSize:13,color:"#37352f",lineHeight:1.7}}/>
        </div>
      )}
    </div>
  );
}

// ─── POST PRODUCTION PANEL ────────────────────────────────────────────────────
function PostProductionPanel({postProduction,onUpdate,readonly,concepts,projectId,meetingHistory,fullTranscript}){
  const pp=obj(postProduction);
  const items=arr(pp.items);
  const[addingRound,setAddingRound]=useState(null);
  const[editingId,setEditingId]=useState(null);
  const[draft,setDraft]=useState({});
  // Import panel state
  const[importMode,setImportMode]=useState(null); // null | "meeting" | "dictate"
  const[importText,setImportText]=useState("");
  const[selectedMeetingIdx,setSelectedMeetingIdx]=useState(null);
  const[extracting,setExtracting]=useState(false);
  const[extracted,setExtracted]=useState(null);
  const[extractError,setExtractError]=useState(null);
  const[dictating,setDictating]=useState(false);
  const[targetRound,setTargetRound]=useState(null);

  const STATUS_STYLES={
    pending:{bg:"#fdeee4",c:"#b94a1a",label:"Pending"},
    in_progress:{bg:"#e8f0fe",c:"#1a56c4",label:"In Progress"},
    done:{bg:"#e6f4ea",c:"#1e7e34",label:"Done"},
    wont_fix:{bg:"#f1f0ef",c:"#9b9a97",label:"Won't Fix"},
  };

  const rounds=[...new Set(items.map(r=>r.round||1))].sort((a,b)=>a-b);
  const maxRound=rounds.length?Math.max(...rounds):0;
  // Keep targetRound in sync with maxRound when first opened
  React.useEffect(()=>{if(targetRound===null)setTargetRound(maxRound+1);},[maxRound]);

  function save(id,patch){
    onUpdate({...pp,items:items.map(r=>r.id===id?{...r,...patch}:r)});
    setEditingId(null);
  }

  function addItem(round,requestedBy){
    const newItem={id:`ri-${Date.now()}`,round,timecode:"",description:"",status:"pending",requestedBy,concept:"",notes:"",createdAt:new Date().toISOString()};
    onUpdate({...pp,items:[...items,newItem]});
    setEditingId(newItem.id);
    setDraft(newItem);
    setAddingRound(null);
  }

  function removeItem(id){onUpdate({...pp,items:items.filter(r=>r.id!==id)});}

  const statusCycle={pending:"in_progress",in_progress:"done",done:"wont_fix",wont_fix:"pending"};

  // ── Import helpers ────────────────────────────────────────────────────────
  function openImport(mode){
    setImportMode(mode);setImportText("");setExtracted(null);setExtractError(null);setSelectedMeetingIdx(null);
    if(mode==="meeting"){setTargetRound(maxRound+1);}
  }
  function closeImport(){setImportMode(null);setImportText("");setExtracted(null);setExtractError(null);setDictating(false);if(window._ppRec){window._ppRec.stop();window._ppRec=null;}}

  function loadMeetingTranscript(idx){
    const history=arr(meetingHistory);
    const m=history[idx];
    if(!m)return;
    setSelectedMeetingIdx(idx);
    // Use full transcript if this meeting's transcriptExcerpt matches what we stored, else excerpt
    const isLatest=idx===history.length-1;
    setImportText(isLatest&&fullTranscript?fullTranscript:m.transcriptExcerpt||"(No transcript available for this meeting)");
  }

  function startDictation(){
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR){setExtractError("Speech recognition not supported in this browser — try Chrome");return;}
    const rec=new SR();rec.continuous=true;rec.interimResults=true;rec.lang="en-US";
    let final="";
    rec.onresult=e=>{let interim="";for(let i=e.resultIndex;i<e.results.length;i++){if(e.results[i].isFinal)final+=e.results[i][0].transcript+" ";else interim+=e.results[i][0].transcript;}setImportText(final+interim);};
    rec.onend=()=>setDictating(false);
    rec.start();setDictating(true);window._ppRec=rec;
  }
  function stopDictation(){if(window._ppRec){window._ppRec.stop();window._ppRec=null;}setDictating(false);}

  async function extractRevisions(){
    if(!importText.trim())return;
    setExtracting(true);setExtractError(null);setExtracted(null);
    try{
      const res=await fetch("/api/recall-webhook?action=extract-revisions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:importText,conceptTitles:arr(concepts).map(c=>c.title)})});
      const data=await res.json();
      if(!res.ok||!data.ok)throw new Error(data.error||"Extraction failed");
      if(!data.items?.length)throw new Error("No revision requests found in the text");
      setExtracted(data.items.map((item,i)=>({...item,_selected:true,_id:`ext-${Date.now()}-${i}`})));
    }catch(e){setExtractError(e.message);}finally{setExtracting(false);}
  }

  function applyExtracted(){
    const round=targetRound??maxRound+1;
    const newItems=extracted.filter(x=>x._selected).map(x=>({id:`ri-${Date.now()}-${Math.random().toString(36).slice(2)}`,round,timecode:x.timecode||"",description:x.description||"",status:"pending",requestedBy:importMode==="dictate"?"team":"client",concept:x.concept||"",notes:x.notes||"",createdAt:new Date().toISOString()}));
    onUpdate({...pp,items:[...items,...newItems]});
    closeImport();
  }

  return(
    <div style={{maxWidth:760,margin:"0 auto",padding:"32px 24px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
        <div>
          <div style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:"#c4c3bf",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:4}}>Post Production</div>
          <h2 style={{fontSize:22,fontWeight:700,color:"#37352f",margin:0}}>Client Revisions</h2>
        </div>
        {!readonly&&<div style={{display:"flex",gap:8}}>
          <button onClick={()=>openImport("meeting")} style={{background:"none",color:"#1a56c4",border:"1px solid #d2e3fc",padding:"7px 13px",borderRadius:6,fontFamily:"'IBM Plex Mono',monospace",fontSize:11,cursor:"pointer",fontWeight:600}}>📎 From Meeting</button>
          <button onClick={()=>openImport("dictate")} style={{background:"none",color:"#37352f",border:"1px solid #e8e4dc",padding:"7px 13px",borderRadius:6,fontFamily:"'IBM Plex Mono',monospace",fontSize:11,cursor:"pointer",fontWeight:600}}>🎙 Dictate</button>
          <button onClick={()=>{const r=maxRound+1;onUpdate({...pp,items:[...items,{id:`ri-${Date.now()}`,round:r,timecode:"",description:"",status:"pending",requestedBy:"team",concept:"",notes:"",createdAt:new Date().toISOString()}]});setAddingRound(r);}} style={{background:"#37352f",color:"#fff",border:"none",padding:"8px 16px",borderRadius:6,fontFamily:"'Lora',serif",fontSize:12,cursor:"pointer",fontWeight:600}}>+ New Round</button>
        </div>}
      </div>
      <p style={{fontSize:13,color:"#9b9a97",lineHeight:1.6,marginBottom:28}}>Time-coded revision requests from client review. Both you and your client can add items — use the shared link to give your client access.</p>

      {/* ── Import Panel ──────────────────────────────────────────────────── */}
      {importMode&&(
        <div style={{border:"1px solid #d2e3fc",borderRadius:10,background:"#f5f8ff",padding:"20px 20px 16px",marginBottom:28}}>
          {/* Header row */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
            <div style={{fontSize:13,fontWeight:700,color:"#1a56c4"}}>
              {importMode==="meeting"?"📎 Import from Meeting Transcript":"🎙 Dictate Revision Requests"}
            </div>
            <button onClick={closeImport} style={{background:"none",border:"none",color:"#9b9a97",fontSize:16,cursor:"pointer",padding:"0 2px",lineHeight:1}}>✕</button>
          </div>

          {/* Meeting selector (meeting mode) */}
          {importMode==="meeting"&&(
            <div style={{marginBottom:12}}>
              {arr(meetingHistory).length===0?(
                <div style={{fontSize:13,color:"#9b9a97",fontStyle:"italic"}}>No meeting history for this project yet.</div>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {arr(meetingHistory).map((m,i)=>{
                    const label=m.title||m.eventTitle||`Meeting ${i+1}`;
                    const date=m.date||m.createdAt?new Date(m.date||m.createdAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"";
                    const sel=selectedMeetingIdx===i;
                    return(
                      <button key={m.id||i} onClick={()=>loadMeetingTranscript(i)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",textAlign:"left",background:sel?"#e8f0fe":"#fff",border:`1px solid ${sel?"#1a56c4":"#e8e4dc"}`,borderRadius:7,padding:"10px 14px",cursor:"pointer",transition:"all .1s"}}>
                        <div>
                          <div style={{fontSize:13,fontWeight:sel?700:400,color:sel?"#1a56c4":"#37352f"}}>{label}</div>
                          {date&&<div style={{fontSize:11,color:"#9b9a97",fontFamily:"'IBM Plex Mono',monospace",marginTop:2}}>{date}</div>}
                        </div>
                        {sel&&<span style={{fontSize:11,color:"#1a56c4",fontFamily:"'IBM Plex Mono',monospace"}}>✓ loaded</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Dictation controls (dictate mode) */}
          {importMode==="dictate"&&(
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
              {!dictating?(
                <button onClick={startDictation} style={{display:"flex",alignItems:"center",gap:6,background:"#e97942",color:"#fff",border:"none",borderRadius:7,padding:"10px 18px",cursor:"pointer",fontSize:13,fontWeight:600,fontFamily:"'Lora',serif"}}>
                  <span style={{fontSize:18}}>🎙</span> Start Dictating
                </button>
              ):(
                <button onClick={stopDictation} style={{display:"flex",alignItems:"center",gap:6,background:"#c0392b",color:"#fff",border:"none",borderRadius:7,padding:"10px 18px",cursor:"pointer",fontSize:13,fontWeight:600,fontFamily:"'Lora',serif",animation:"pulse 1.2s ease-in-out infinite"}}>
                  <span style={{fontSize:18}}>⏹</span> Stop Recording
                </button>
              )}
              <div style={{fontSize:12,color:"#9b9a97"}}>Speak your revision notes — AI will extract each request with timecodes.</div>
            </div>
          )}

          {/* Shared: transcript/dictation text area */}
          {(importMode==="dictate"||(importMode==="meeting"&&selectedMeetingIdx!==null))&&(
            <div style={{marginBottom:12}}>
              <div style={{fontSize:10,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>
                {importMode==="dictate"?"Your Spoken Notes":"Transcript Preview"}
                {dictating&&<span style={{marginLeft:8,color:"#c0392b",fontWeight:700}}>● RECORDING</span>}
              </div>
              <textarea
                value={importText}
                onChange={e=>setImportText(e.target.value)}
                rows={6}
                placeholder={importMode==="dictate"?"Start speaking — text will appear here…":"Transcript will load here. You can edit it before extracting."}
                style={{width:"100%",border:"1px solid #d2e3fc",borderRadius:6,padding:"10px 12px",fontFamily:"'Lora',serif",fontSize:12,color:"#37352f",background:"#fff",resize:"vertical",outline:"none",boxSizing:"border-box",lineHeight:1.6}}
              />
            </div>
          )}

          {/* Extract button */}
          {(importMode==="dictate"||(importMode==="meeting"&&selectedMeetingIdx!==null))&&!extracted&&(
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
              <button onClick={extractRevisions} disabled={extracting||!importText.trim()} style={{background:extracting||!importText.trim()?"#c4c3bf":"#1a56c4",color:"#fff",border:"none",borderRadius:6,padding:"9px 20px",fontFamily:"'Lora',serif",fontSize:13,cursor:extracting||!importText.trim()?"not-allowed":"pointer",fontWeight:600}}>
                {extracting?"Extracting…":"✦ Extract Revisions"}
              </button>
              {extracting&&<div style={{fontSize:12,color:"#9b9a97"}}>AI is reading the transcript…</div>}
            </div>
          )}

          {extractError&&<div style={{fontSize:12,color:"#c0392b",marginTop:6,background:"#fdf2f2",border:"1px solid #f5c6cb",borderRadius:5,padding:"8px 12px"}}>{extractError}</div>}

          {/* Extracted items preview */}
          {extracted&&extracted.length>0&&(
            <div>
              <div style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:"#1a56c4",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10,fontWeight:600}}>
                {extracted.length} revision{extracted.length!==1?"s":""} found — select which to add:
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:14}}>
                {extracted.map((x,i)=>(
                  <label key={x._id} style={{display:"flex",alignItems:"flex-start",gap:10,background:x._selected?"#fff":"#f7f6f3",border:`1px solid ${x._selected?"#1a56c4":"#e8e4dc"}`,borderRadius:7,padding:"10px 12px",cursor:"pointer",transition:"all .1s"}}>
                    <input type="checkbox" checked={!!x._selected} onChange={()=>setExtracted(ex=>ex.map((e,j)=>j===i?{...e,_selected:!e._selected}:e))} style={{marginTop:2,flexShrink:0,accentColor:"#1a56c4"}}/>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:x.concept||x.notes?3:0}}>
                        {x.timecode&&<span style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",background:"#f1f0ef",color:"#55534e",borderRadius:4,padding:"1px 6px",fontWeight:600,flexShrink:0}}>{x.timecode}</span>}
                        <span style={{fontSize:13,color:"#37352f",lineHeight:1.5}}>{x.description}</span>
                      </div>
                      {(x.concept||x.notes)&&<div style={{fontSize:11,color:"#9b9a97"}}>{x.concept&&<span style={{marginRight:8}}>📹 {x.concept}</span>}{x.notes&&<span>{x.notes}</span>}</div>}
                    </div>
                  </label>
                ))}
              </div>
              {/* Round selector + apply */}
              <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                <div style={{fontSize:12,color:"#37352f",fontWeight:600}}>Add to round:</div>
                {[...Array(maxRound+2)].map((_,i)=>{
                  const r=i+1;
                  return(
                    <button key={r} onClick={()=>setTargetRound(r)} style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",background:targetRound===r?"#37352f":"#f1f0ef",color:targetRound===r?"#fff":"#55534e",border:"none",borderRadius:5,padding:"4px 10px",cursor:"pointer",fontWeight:600}}>
                      {r<=maxRound?`Round ${r}`:`Round ${r} (new)`}
                    </button>
                  );
                })}
                <button onClick={applyExtracted} disabled={!extracted.some(x=>x._selected)} style={{background:extracted.some(x=>x._selected)?"#1a56c4":"#c4c3bf",color:"#fff",border:"none",borderRadius:6,padding:"8px 18px",fontFamily:"'Lora',serif",fontSize:13,cursor:extracted.some(x=>x._selected)?"pointer":"not-allowed",fontWeight:600,marginLeft:"auto"}}>
                  Add {extracted.filter(x=>x._selected).length} Item{extracted.filter(x=>x._selected).length!==1?"s":""}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {rounds.length===0&&(
        <div style={{border:"2px dashed #e8e4dc",borderRadius:10,padding:"40px 24px",textAlign:"center"}}>
          <div style={{fontSize:28,marginBottom:12}}>✂️</div>
          <div style={{fontSize:14,fontWeight:700,color:"#37352f",marginBottom:6}}>No revision rounds yet</div>
          <div style={{fontSize:13,color:"#9b9a97",marginBottom:16,lineHeight:1.6}}>After sharing your first cut, add a revision round to start tracking feedback with timecodes.</div>
          {!readonly&&<button onClick={()=>addItem(1,"team")} style={{background:"#37352f",color:"#fff",border:"none",padding:"8px 20px",borderRadius:6,fontFamily:"'Lora',serif",fontSize:12,cursor:"pointer"}}>+ Add First Revision</button>}
          {readonly&&<button onClick={()=>addItem(1,"client")} style={{background:"#1a56c4",color:"#fff",border:"none",padding:"8px 20px",borderRadius:6,fontFamily:"'Lora',serif",fontSize:12,cursor:"pointer"}}>+ Add Revision Request</button>}
        </div>
      )}

      {rounds.map(round=>{
        const roundItems=items.filter(r=>r.round===round);
        const allDone=roundItems.length>0&&roundItems.every(r=>r.status==="done"||r.status==="wont_fix");
        return(
          <div key={round} style={{marginBottom:32}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
              <div style={{fontSize:13,fontWeight:700,color:"#37352f"}}>Round {round}</div>
              {allDone&&<span style={{fontSize:10,fontFamily:"'IBM Plex Mono',monospace",background:"#e6f4ea",color:"#1e7e34",borderRadius:20,padding:"2px 8px",fontWeight:600}}>✓ Complete</span>}
              <div style={{flex:1,height:1,background:"#f1f0ef"}}/>
              <div style={{display:"flex",gap:6}}>
                {!readonly&&<button onClick={()=>addItem(round,"team")} style={{fontSize:11,color:"#9b9a97",background:"none",border:"1px solid #e8e4dc",borderRadius:5,padding:"3px 8px",cursor:"pointer",fontFamily:"'IBM Plex Mono',monospace"}} onMouseEnter={e=>e.currentTarget.style.borderColor="#37352f"} onMouseLeave={e=>e.currentTarget.style.borderColor="#e8e4dc"}>+ Add</button>}
                {readonly&&<button onClick={()=>addItem(round,"client")} style={{fontSize:11,color:"#1a56c4",background:"none",border:"1px solid #d2e3fc",borderRadius:5,padding:"3px 8px",cursor:"pointer",fontFamily:"'IBM Plex Mono',monospace"}} onMouseEnter={e=>e.currentTarget.style.borderColor="#1a56c4"} onMouseLeave={e=>e.currentTarget.style.borderColor="#d2e3fc"}>+ Request</button>}
              </div>
            </div>

            {roundItems.length===0&&<div style={{fontSize:13,color:"#c4c3bf",fontStyle:"italic",paddingLeft:4}}>No items in this round yet.</div>}

            {roundItems.map(item=>{
              const st=STATUS_STYLES[item.status]||STATUS_STYLES.pending;
              const isEditing=editingId===item.id;
              const isClient=item.requestedBy==="client";
              return(
                <div key={item.id} style={{border:`1px solid ${isEditing?"#1a56c4":"#f1f0ef"}`,borderRadius:10,marginBottom:8,background:isEditing?"#f5f8ff":"#fff",transition:"all .15s"}}>
                  {isEditing?(
                    <div style={{padding:"14px 16px"}}>
                      <div style={{display:"grid",gridTemplateColumns:"90px 1fr",gap:10,marginBottom:10}}>
                        <div>
                          <div style={{fontSize:10,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>Timecode</div>
                          <input value={draft.timecode||""} onChange={e=>setDraft(d=>({...d,timecode:e.target.value}))} placeholder="00:00" style={{width:"100%",border:"1px solid #e8e4dc",borderRadius:6,padding:"6px 8px",fontFamily:"'IBM Plex Mono',monospace",fontSize:13,color:"#37352f",background:"#fff",outline:"none",boxSizing:"border-box"}} onFocus={e=>e.target.style.borderColor="#1a56c4"} onBlur={e=>e.target.style.borderColor="#e8e4dc"}/>
                        </div>
                        <div>
                          <div style={{fontSize:10,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>Revision Request</div>
                          <input value={draft.description||""} onChange={e=>setDraft(d=>({...d,description:e.target.value}))} placeholder="Describe the change needed…" autoFocus style={{width:"100%",border:"1px solid #e8e4dc",borderRadius:6,padding:"6px 8px",fontFamily:"'Lora',serif",fontSize:13,color:"#37352f",background:"#fff",outline:"none",boxSizing:"border-box"}} onFocus={e=>e.target.style.borderColor="#1a56c4"} onBlur={e=>e.target.style.borderColor="#e8e4dc"}/>
                        </div>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                        <div>
                          <div style={{fontSize:10,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>Concept / Clip</div>
                          <input value={draft.concept||""} onChange={e=>setDraft(d=>({...d,concept:e.target.value}))} placeholder="e.g. The Founder's FaceTime Drop" style={{width:"100%",border:"1px solid #e8e4dc",borderRadius:6,padding:"6px 8px",fontFamily:"'Lora',serif",fontSize:12,color:"#37352f",background:"#fff",outline:"none",boxSizing:"border-box"}} onFocus={e=>e.target.style.borderColor="#1a56c4"} onBlur={e=>e.target.style.borderColor="#e8e4dc"}/>
                        </div>
                        <div>
                          <div style={{fontSize:10,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>Notes</div>
                          <input value={draft.notes||""} onChange={e=>setDraft(d=>({...d,notes:e.target.value}))} placeholder="Additional context…" style={{width:"100%",border:"1px solid #e8e4dc",borderRadius:6,padding:"6px 8px",fontFamily:"'Lora',serif",fontSize:12,color:"#37352f",background:"#fff",outline:"none",boxSizing:"border-box"}} onFocus={e=>e.target.style.borderColor="#1a56c4"} onBlur={e=>e.target.style.borderColor="#e8e4dc"}/>
                        </div>
                      </div>
                      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                        <button onClick={()=>{setEditingId(null);setDraft({});}} style={{background:"none",border:"1px solid #e8e4dc",borderRadius:6,padding:"6px 12px",fontFamily:"'Lora',serif",fontSize:12,cursor:"pointer",color:"#9b9a97"}}>Cancel</button>
                        <button onClick={()=>save(item.id,draft)} style={{background:"#1a56c4",color:"#fff",border:"none",borderRadius:6,padding:"6px 14px",fontFamily:"'Lora',serif",fontSize:12,cursor:"pointer",fontWeight:600}}>Save</button>
                      </div>
                    </div>
                  ):(
                    <div style={{display:"flex",alignItems:"flex-start",gap:0,padding:"12px 14px"}}>
                      {/* Timecode chip */}
                      <div style={{flexShrink:0,width:56,paddingRight:12,paddingTop:2}}>
                        {item.timecode?<span style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",background:"#f1f0ef",color:"#55534e",borderRadius:4,padding:"2px 6px",fontWeight:600}}>{item.timecode}</span>:<span style={{fontSize:11,color:"#c4c3bf",fontFamily:"'IBM Plex Mono',monospace"}}>—</span>}
                      </div>
                      {/* Content */}
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"flex-start",gap:8,marginBottom:item.concept||item.notes?4:0}}>
                          <span style={{fontSize:13,color:"#37352f",lineHeight:1.55,flex:1,overflowWrap:"break-word"}}>{item.description||<span style={{color:"#c4c3bf",fontStyle:"italic"}}>No description</span>}</span>
                        </div>
                        {(item.concept||item.notes)&&<div style={{fontSize:11,color:"#9b9a97",lineHeight:1.5}}>{item.concept&&<span style={{marginRight:8}}>📹 {item.concept}</span>}{item.notes&&<span>{item.notes}</span>}</div>}
                      </div>
                      {/* Right: status + actions */}
                      <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0,marginLeft:10}}>
                        <span style={{fontSize:10,fontFamily:"'IBM Plex Mono',monospace",background:isClient?"#e8f0fe":"#f7f6f3",color:isClient?"#1a56c4":"#9b9a97",borderRadius:20,padding:"1px 7px",fontWeight:600}}>{isClient?"Client":"Team"}</span>
                        <button onClick={()=>save(item.id,{status:statusCycle[item.status]||"pending"})} title="Cycle status" style={{fontSize:10,fontFamily:"'IBM Plex Mono',monospace",background:st.bg,color:st.c,border:"none",borderRadius:20,padding:"3px 8px",cursor:"pointer",fontWeight:600,whiteSpace:"nowrap"}}>{st.label}</button>
                        {((!readonly)||isClient)&&<button onClick={()=>{setEditingId(item.id);setDraft({...item});}} style={{background:"none",border:"1px solid #e8e4dc",borderRadius:5,padding:"2px 7px",cursor:"pointer",fontSize:11,color:"#9b9a97"}} onMouseEnter={e=>e.currentTarget.style.borderColor="#37352f"} onMouseLeave={e=>e.currentTarget.style.borderColor="#e8e4dc"}>✎</button>}
                        {!readonly&&<button onClick={()=>removeItem(item.id)} style={{background:"none",border:"none",color:"#c4c3bf",cursor:"pointer",fontSize:14,padding:"0 2px",lineHeight:1}} onMouseEnter={e=>e.currentTarget.style.color="#c0392b"} onMouseLeave={e=>e.currentTarget.style.color="#c4c3bf"}>✕</button>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Status legend */}
      {items.length>0&&(
        <div style={{display:"flex",gap:12,flexWrap:"wrap",paddingTop:16,borderTop:"1px solid #f1f0ef"}}>
          <span style={{fontSize:11,color:"#c4c3bf",fontFamily:"'IBM Plex Mono',monospace"}}>STATUS:</span>
          {Object.entries(STATUS_STYLES).map(([k,v])=>(
            <span key={k} style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",background:v.bg,color:v.c,borderRadius:20,padding:"2px 8px",fontWeight:600}}>{v.label}</span>
          ))}
          <span style={{fontSize:11,color:"#c4c3bf",fontFamily:"'IBM Plex Mono',monospace",marginLeft:4}}>— click status badge to cycle</span>
        </div>
      )}
    </div>
  );
}

// ─── MEETINGS SCREEN ──────────────────────────────────────────────────────────
function MeetingsScreen({user,projects,onBack}){
  const[meetings,setMeetings]=useState([]);
  const[loading,setLoading]=useState(true);
  const[calendarConnected,setCalendarConnected]=useState(false);
  const[linking,setLinking]=useState(null);
  const[connecting,setConnecting]=useState(false);
  const[reconnecting,setReconnecting]=useState(false);
  const[reconnectError,setReconnectError]=useState("");

  useEffect(()=>{
    loadData();
    // Poll every 30s — detects when user has joined a meeting early so bot gets triggered immediately
    const interval=setInterval(()=>{
      if(document.visibilityState==="visible") loadData();
    },30000);
    return()=>clearInterval(interval);
  },[]);

  async function loadData(){
    setLoading(true);
    setReconnectError("");
    const{data}=await supabase.from("user_settings").select("calendar_connected,recall_calendar_id").eq("id",user.id).single();
    const connected=!!data?.calendar_connected;
    setCalendarConnected(connected);
    if(connected){
      // recall_calendar_id missing means Recall.ai connection failed during OAuth — auto-fix silently
      if(!data?.recall_calendar_id){
        setReconnecting(true);
        try{
          const rr=await fetch("/api/google-calendar-auth?action=reconnect-recall",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:user.id})});
          const rd=await rr.json();
          if(!rr.ok||rd.error){
            setReconnectError(rd.message||rd.raw||"Could not connect to Recall.ai — try disconnecting and reconnecting your calendar.");
            setLoading(false);setReconnecting(false);return;
          }
        }catch(e){setReconnectError("Network error reconnecting to Recall.ai.");setLoading(false);setReconnecting(false);return;}
        setReconnecting(false);
      }
      try{const res=await fetch(`/api/google-calendar-auth?action=upcoming-meetings&userId=${user.id}`);const d=await res.json();setMeetings(d.meetings||[]);}
      catch(e){console.error(e);}
    }
    setLoading(false);
  }

  async function handleConnect(){
    setConnecting(true);
    try{const res=await fetch(`/api/google-calendar-auth?action=oauth-url&userId=${user.id}`);const d=await res.json();if(d.url)window.location.href=d.url;}
    catch(e){console.error(e);setConnecting(false);}
  }

  async function handleLink(meetingId,projectId){
    setLinking(meetingId);
    try{
      await fetch("/api/google-calendar-auth?action=link-meeting",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:user.id,meetingId,projectId:projectId||null})});
      setMeetings(prev=>prev.map(m=>m.id===meetingId?{...m,linkedProjectId:projectId||null}:m));
    }catch(e){console.error(e);}
    setLinking(null);
  }

  return(
    <div style={{minHeight:"100vh",background:"#fff",display:"flex",flexDirection:"column"}}>
      <div style={{borderBottom:"1px solid #f1f0ef",padding:"12px 20px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:"#9b9a97",cursor:"pointer",fontSize:13,fontFamily:"'Lora',serif"}}>← Dashboard</button>
        <span style={{color:"#e8e4dc"}}>|</span>
        <span style={{fontSize:14,fontWeight:700,color:"#37352f"}}>📅 Meetings</span>
      </div>
      <div style={{flex:1,padding:"32px 24px",maxWidth:760,margin:"0 auto",width:"100%",boxSizing:"border-box"}}>
        {!calendarConnected?(
          <div style={{textAlign:"center",padding:"60px 20px",maxWidth:480,margin:"0 auto"}}>
            <div style={{fontSize:56,marginBottom:16}}>📅</div>
            <p style={{fontSize:20,fontWeight:700,color:"#37352f",marginBottom:10,letterSpacing:"-0.02em"}}>Connect Google Calendar</p>
            <p style={{fontSize:14,color:"#9b9a97",marginBottom:28,lineHeight:1.8}}>Frame Brief will auto-join every meeting on your calendar, transcribe the conversation, and automatically generate or update your production brief.</p>
            <button onClick={handleConnect} disabled={connecting} style={{background:"#37352f",color:"#fff",border:"none",padding:"13px 28px",borderRadius:8,fontFamily:"'Lora',serif",fontSize:14,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:10,marginBottom:16,opacity:connecting?0.7:1}}>
              <span style={{fontSize:18}}>📅</span>
              {connecting?"Connecting…":"Connect Google Calendar"}
            </button>
            <div style={{fontSize:12,color:"#c4c3bf",lineHeight:1.7}}>Read-only access · No emails sent · Disconnect anytime</div>
          </div>
        ):reconnecting?(
          <div style={{textAlign:"center",padding:"60px 20px",color:"#9b9a97",fontSize:14,fontStyle:"italic"}}>
            <div style={{fontSize:32,marginBottom:12}}>🔄</div>
            Finishing calendar setup…
          </div>
        ):reconnectError?(
          <div style={{textAlign:"center",padding:"60px 20px",maxWidth:480,margin:"0 auto"}}>
            <div style={{fontSize:40,marginBottom:12}}>⚠️</div>
            <p style={{fontSize:15,fontWeight:700,color:"#37352f",marginBottom:8}}>Calendar sync issue</p>
            <p style={{fontSize:13,color:"#9b9a97",marginBottom:20,lineHeight:1.7}}>{reconnectError}</p>
            <button onClick={handleConnect} style={{background:"#37352f",color:"#fff",border:"none",padding:"11px 24px",borderRadius:8,fontFamily:"'Lora',serif",fontSize:13,cursor:"pointer"}}>Reconnect Google Calendar</button>
          </div>
        ):loading?(
          <div style={{textAlign:"center",padding:"60px 20px",color:"#9b9a97",fontSize:14,fontStyle:"italic"}}>Loading meetings…</div>
        ):meetings.length===0?(
          <div style={{textAlign:"center",padding:"60px 20px"}}>
            <div style={{fontSize:48,marginBottom:14}}>🗓</div>
            <p style={{fontSize:17,fontWeight:700,color:"#37352f",marginBottom:8}}>No upcoming meetings</p>
            <p style={{fontSize:14,color:"#9b9a97",lineHeight:1.7}}>No meetings in the next 7 days. Frame Brief will auto-join when one appears on your calendar.</p>
          </div>
        ):(
          <div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24}}>
              <h1 style={{fontSize:26,fontWeight:700,color:"#37352f",letterSpacing:"-0.02em"}}>Upcoming Meetings</h1>
              <button onClick={loadData} style={{background:"none",border:"1px solid #e8e4dc",borderRadius:6,padding:"6px 12px",fontSize:12,color:"#9b9a97",cursor:"pointer",fontFamily:"'Lora',serif"}}>↺ Refresh</button>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {meetings.map(m=>{
                const start=new Date(m.startTime);
                const linkedProject=projects.find(p=>p.id===m.linkedProjectId);
                const isConsultation=!!m.linkedProjectId;
                return(
                  <div key={m.id} style={{border:`1px solid ${isConsultation?"#c5d8fb":"#f1f0ef"}`,borderRadius:12,padding:"18px 20px",background:isConsultation?"#f5f8ff":"#fafaf9"}}>
                    <div style={{display:"flex",alignItems:"flex-start",gap:16,flexWrap:"wrap"}}>
                      <div style={{flex:1,minWidth:180}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,flexWrap:"wrap"}}>
                          <span style={{fontSize:11,fontWeight:700,fontFamily:"'IBM Plex Mono',monospace",borderRadius:20,padding:"3px 10px",background:isConsultation?"#e8f0fe":"#e6f4ea",color:isConsultation?"#1a56c4":"#1e7e34",whiteSpace:"nowrap"}}>
                            {isConsultation?`📝 Consultation → ${linkedProject?.title||"Project"}`:"🆕 New Brief"}
                          </span>
                          {m.botScheduled
                            ? <span style={{fontSize:11,background:"#e6f4ea",color:"#1e7e34",borderRadius:20,padding:"3px 10px",fontWeight:600,fontFamily:"'IBM Plex Mono',monospace",whiteSpace:"nowrap"}}>🤖 Auto-joining</span>
                            : <span style={{fontSize:11,background:"#fff8e6",color:"#b36d00",borderRadius:20,padding:"3px 10px",fontWeight:600,fontFamily:"'IBM Plex Mono',monospace",whiteSpace:"nowrap"}}>⏳ Scheduling bot…</span>
                          }
                        </div>
                        <div style={{fontWeight:700,fontSize:15,color:"#37352f",marginBottom:4}}>{m.title}</div>
                        <div style={{fontSize:12,color:"#9b9a97",marginBottom:4}}>{start.toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})} · {start.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})}</div>
                        {m.attendees?.length>0&&<div style={{fontSize:11,color:"#c4c3bf"}}>{m.attendees.slice(0,3).join(", ")}{m.attendees.length>3?` +${m.attendees.length-3} more`:""}</div>}
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:4,alignItems:"flex-end",flexShrink:0}}>
                        <select value={m.linkedProjectId||""} onChange={e=>handleLink(m.id,e.target.value||null)} disabled={linking===m.id}
                          style={{border:"1px solid #e8e4dc",borderRadius:6,padding:"7px 10px",fontSize:12,fontFamily:"'Lora',serif",background:"#fff",outline:"none",color:m.linkedProjectId?"#1a56c4":"#9b9a97",cursor:"pointer",maxWidth:230}}>
                          <option value="">Follow-up? Link to project…</option>
                          {projects.map(p=><option key={p.id} value={p.id}>{p.brief?.coverEmoji||"🎬"} {p.title||"Untitled"}</option>)}
                        </select>
                        {m.linkedProjectId&&<span style={{fontSize:10,color:"#9b9a97",fontFamily:"'IBM Plex Mono',monospace"}}>transcript → existing brief</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── CONSULTATION MODAL ────────────────────────────────────────────────────────
function JoinCallModal({user,project,projects,onClose,onScheduled}){
  const[tab,setTab]=useState("calendar");
  const[meetings,setMeetings]=useState([]);
  const[loading,setLoading]=useState(true);
  const[calendarConnected,setCalendarConnected]=useState(false);
  const[selectedMeetingId,setSelectedMeetingId]=useState(null);
  const[url,setUrl]=useState("");
  const[scheduling,setScheduling]=useState(false);
  const[error,setError]=useState("");

  useEffect(()=>{loadMeetings();},[]);

  async function loadMeetings(){
    setLoading(true);
    const{data}=await supabase.from("user_settings").select("calendar_connected").eq("id",user.id).single();
    setCalendarConnected(!!data?.calendar_connected);
    if(data?.calendar_connected){
      try{
        const res=await fetch(`/api/google-calendar-auth?action=upcoming-meetings&userId=${user.id}`);
        const d=await res.json();
        setMeetings((d.meetings||[]).filter(m=>!m.linkedProjectId||m.linkedProjectId===project.id));
      }catch(e){console.error(e);}
    }else{
      setTab("url");
    }
    setLoading(false);
  }

  async function handleScheduleCalendar(){
    if(!selectedMeetingId)return;
    setScheduling(true);setError("");
    try{
      await fetch("/api/google-calendar-auth?action=link-meeting",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:user.id,meetingId:selectedMeetingId,projectId:project.id})});
      await supabase.from("projects").update({meeting_stage:"consultation",updated_at:new Date().toISOString()}).eq("id",project.id);
      onScheduled("consultation");onClose();
    }catch(e){setError(e.message);}
    setScheduling(false);
  }

  async function handleScheduleUrl(){
    if(!url.trim())return;
    setScheduling(true);setError("");
    try{
      const bot=await startRecallBot(url.trim(),project.id);
      const botId=bot.botId||bot.id;
      await supabase.from("projects").update({recall_bot_id:botId,recall_status:"bot_joined",meeting_stage:"consultation",updated_at:new Date().toISOString()}).eq("id",project.id);
      onScheduled("consultation");onClose();
    }catch(e){setError(e.message);}
    setScheduling(false);
  }

  const canSubmit=tab==="calendar"&&calendarConnected?!!selectedMeetingId:!!url.trim();

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:"#fff",borderRadius:14,width:"100%",maxWidth:500,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.22)"}}>
        <div style={{padding:"20px 24px 16px",borderBottom:"1px solid #f1f0ef",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{fontWeight:700,fontSize:16,color:"#37352f",marginBottom:4}}>📞 Join Call</div>
            <div style={{fontSize:12,color:"#9b9a97",lineHeight:1.5}}>{project?.title} — Frame Brief will join and auto-generate meeting notes for this brief</div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#9b9a97",flexShrink:0,lineHeight:1,padding:"2px 4px"}}>✕</button>
        </div>
        {calendarConnected&&(
          <div style={{display:"flex",borderBottom:"1px solid #f1f0ef"}}>
            {[["calendar","📅 Pick from Calendar"],["url","🔗 Paste Meeting URL"]].map(([t,label])=>(
              <button key={t} onClick={()=>setTab(t)} style={{flex:1,padding:"12px",border:"none",background:"none",cursor:"pointer",fontSize:13,fontFamily:"'Lora',serif",color:tab===t?"#1a56c4":"#9b9a97",fontWeight:tab===t?700:400,borderBottom:tab===t?"2px solid #1a56c4":"2px solid transparent",transition:"all .15s"}}>{label}</button>
            ))}
          </div>
        )}
        <div style={{padding:"20px 24px"}}>
          {tab==="calendar"&&calendarConnected&&(
            loading?(<div style={{textAlign:"center",padding:"30px",color:"#9b9a97",fontSize:13,fontStyle:"italic"}}>Loading meetings…</div>)
            :meetings.length===0?(<div style={{textAlign:"center",padding:"24px"}}>
              <div style={{fontSize:32,marginBottom:10}}>🗓</div>
              <p style={{fontSize:13,color:"#9b9a97",marginBottom:16,lineHeight:1.6}}>No upcoming calendar meetings found. Try pasting the meeting URL instead.</p>
              <button onClick={()=>setTab("url")} style={{background:"#37352f",color:"#fff",border:"none",padding:"9px 18px",borderRadius:6,fontFamily:"'Lora',serif",fontSize:13,cursor:"pointer"}}>Paste URL →</button>
            </div>)
            :(<div>
              <div style={{fontSize:12,color:"#9b9a97",marginBottom:12}}>Select the meeting for this consultation:</div>
              <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16,maxHeight:280,overflowY:"auto"}}>
                {meetings.map(m=>{
                  const start=new Date(m.startTime);
                  const isSel=selectedMeetingId===m.id;
                  return(
                    <div key={m.id} onClick={()=>setSelectedMeetingId(m.id)} style={{border:`2px solid ${isSel?"#1a56c4":"#f1f0ef"}`,borderRadius:8,padding:"12px 14px",cursor:"pointer",background:isSel?"#f5f8ff":"#fff",transition:"all .15s"}}>
                      <div style={{fontWeight:600,fontSize:13,color:"#37352f",marginBottom:3}}>{m.title}</div>
                      <div style={{fontSize:12,color:"#9b9a97"}}>{start.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})} · {start.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})}</div>
                    </div>
                  );
                })}
              </div>
            </div>)
          )}
          {(tab==="url"||!calendarConnected)&&(
            <div>
              <div style={{fontSize:12,color:"#9b9a97",marginBottom:10}}>Paste the Google Meet, Zoom, or Teams link:</div>
              <input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://meet.google.com/..." style={{width:"100%",border:"1px solid #e8e4dc",borderRadius:8,padding:"11px 14px",fontFamily:"'Lora',serif",fontSize:13,color:"#37352f",outline:"none",marginBottom:6,boxSizing:"border-box"}} onFocus={e=>e.target.style.borderColor="#37352f"} onBlur={e=>e.target.style.borderColor="#e8e4dc"}/>
              <div style={{fontSize:11,color:"#c4c3bf",marginBottom:16}}>Frame Brief will join immediately and treat this as a revision session for this brief.</div>
            </div>
          )}
          {error&&<div style={{fontSize:12,color:"#c0392b",marginBottom:12}}>⚠ {error}</div>}
          <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
            <button onClick={onClose} style={{border:"1px solid #e8e4dc",background:"none",borderRadius:6,padding:"9px 16px",fontSize:13,color:"#9b9a97",cursor:"pointer",fontFamily:"'Lora',serif"}}>Cancel</button>
            <button onClick={tab==="calendar"&&calendarConnected?handleScheduleCalendar:handleScheduleUrl} disabled={scheduling||!canSubmit} style={{background:"#37352f",color:"#fff",border:"none",borderRadius:6,padding:"9px 18px",fontSize:13,cursor:"pointer",fontFamily:"'Lora',serif",opacity:scheduling||!canSubmit?0.5:1}}>
              {scheduling?"Scheduling…":"Join Call"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── SCHEDULE CONSULTATION MODAL ─────────────────────────────────────────────
function ScheduleConsultationModal({user,project,onClose,onScheduled}){
  const[date,setDate]=useState("");
  const[time,setTime]=useState("");
  const[duration,setDuration]=useState("60");
  const[attendeeEmail,setAttendeeEmail]=useState(project?.brief?.clientEmail||"");
  const[scheduling,setScheduling]=useState(false);
  const[error,setError]=useState("");
  const[calendarConnected,setCalendarConnected]=useState(null);

  useEffect(()=>{
    supabase.from("user_settings").select("calendar_connected").eq("id",user.id).single()
      .then(({data})=>setCalendarConnected(!!data?.calendar_connected));
    // Pre-fill today + 1 day, 10am
    const d=new Date();d.setDate(d.getDate()+1);d.setHours(10,0,0,0);
    setDate(d.toISOString().slice(0,10));
    setTime("10:00");
  },[]);

  async function handleSchedule(){
    if(!date||!time)return;
    setScheduling(true);setError("");
    try{
      const dateTime=new Date(`${date}T${time}:00`).toISOString();
      const res=await fetch("/api/google-calendar-auth?action=create-calendar-event",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({userId:user.id,title:`${project?.title||"Consultation"} — Frame Brief`,dateTime,durationMinutes:parseInt(duration),attendeeEmail:attendeeEmail.trim()||null}),
      });
      const d=await res.json();
      if(!res.ok||!d.ok)throw new Error(d.error||"Failed to create calendar event");
      // Link bot to project if we got a meeting URL
      if(d.meetingUrl){
        await supabase.from("projects").update({meeting_stage:"consultation",updated_at:new Date().toISOString()}).eq("id",project.id);
        onScheduled("consultation");
      }
      onClose();
      // Show brief confirmation
      alert(`✅ Consultation scheduled! Google Meet link created${d.meetingUrl?" — Frame Brief will auto-join":""}.`);
    }catch(e){setError(e.message);}
    setScheduling(false);
  }

  if(calendarConnected===null)return null;

  const isMobile=window.innerWidth<=768;

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:"#fff",borderRadius:14,width:"100%",maxWidth:460,boxShadow:"0 20px 60px rgba(0,0,0,0.22)",overflow:"hidden"}}>
        <div style={{padding:"20px 24px 16px",borderBottom:"1px solid #f1f0ef",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div style={{flex:1,minWidth:0,paddingRight:12}}>
            <div style={{fontWeight:700,fontSize:16,color:"#37352f",marginBottom:4}}>📅 Schedule Consultation</div>
            <div style={{fontSize:12,color:"#9b9a97",lineHeight:1.5}}>{project?.title} — creates a Google Meet event and sends a calendar invite</div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#9b9a97",flexShrink:0,lineHeight:1,padding:"2px 4px"}}>✕</button>
        </div>
        {!calendarConnected?(
          <div style={{padding:"24px",textAlign:"center"}}>
            <div style={{fontSize:32,marginBottom:10}}>🔗</div>
            <p style={{fontSize:13,color:"#9b9a97",lineHeight:1.6}}>Connect Google Calendar first to schedule consultation meetings with auto-join.</p>
          </div>
        ):(
          <div style={{padding:"20px 24px",overflow:"hidden"}}>
            {/* Date + Time: side-by-side on desktop, stacked on mobile */}
            {isMobile?(
              <>
                <div style={{marginBottom:14,overflow:"hidden"}}>
                  <div style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>Date</div>
                  <div style={{border:"1px solid #e8e4dc",borderRadius:8,overflow:"hidden"}}>
                    <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{display:"block",width:"100%",border:"none",padding:"10px 12px",fontFamily:"'Lora',serif",fontSize:13,color:"#37352f",outline:"none",boxSizing:"border-box",background:"transparent"}}/>
                  </div>
                </div>
                <div style={{marginBottom:14,overflow:"hidden"}}>
                  <div style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>Time</div>
                  <div style={{border:"1px solid #e8e4dc",borderRadius:8,overflow:"hidden"}}>
                    <input type="time" value={time} onChange={e=>setTime(e.target.value)} style={{display:"block",width:"100%",border:"none",padding:"10px 12px",fontFamily:"'Lora',serif",fontSize:13,color:"#37352f",outline:"none",boxSizing:"border-box",background:"transparent"}}/>
                  </div>
                </div>
              </>
            ):(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
                <div>
                  <div style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>Date</div>
                  <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{width:"100%",border:"1px solid #e8e4dc",borderRadius:8,padding:"10px 12px",fontFamily:"'Lora',serif",fontSize:13,color:"#37352f",outline:"none",boxSizing:"border-box"}} onFocus={e=>e.target.style.borderColor="#37352f"} onBlur={e=>e.target.style.borderColor="#e8e4dc"}/>
                </div>
                <div>
                  <div style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>Time</div>
                  <input type="time" value={time} onChange={e=>setTime(e.target.value)} style={{width:"100%",border:"1px solid #e8e4dc",borderRadius:8,padding:"10px 12px",fontFamily:"'Lora',serif",fontSize:13,color:"#37352f",outline:"none",boxSizing:"border-box"}} onFocus={e=>e.target.style.borderColor="#37352f"} onBlur={e=>e.target.style.borderColor="#e8e4dc"}/>
                </div>
              </div>
            )}
            <div style={{marginBottom:14}}>
              <div style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>Duration</div>
              <select value={duration} onChange={e=>setDuration(e.target.value)} style={{width:"100%",border:"1px solid #e8e4dc",borderRadius:8,padding:"10px 12px",fontFamily:"'Lora',serif",fontSize:13,color:"#37352f",outline:"none",background:"#fff",boxSizing:"border-box"}}>
                <option value="30">30 minutes</option>
                <option value="45">45 minutes</option>
                <option value="60">1 hour</option>
                <option value="90">1.5 hours</option>
                <option value="120">2 hours</option>
              </select>
            </div>
            <div style={{marginBottom:20}}>
              <div style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>Client Email (optional — sends invite)</div>
              <input type="email" value={attendeeEmail} onChange={e=>setAttendeeEmail(e.target.value)} placeholder="client@email.com" style={{width:"100%",border:"1px solid #e8e4dc",borderRadius:8,padding:"10px 12px",fontFamily:"'Lora',serif",fontSize:13,color:"#37352f",outline:"none",boxSizing:"border-box"}} onFocus={e=>e.target.style.borderColor="#37352f"} onBlur={e=>e.target.style.borderColor="#e8e4dc"}/>
            </div>
            {error&&<div style={{fontSize:12,color:"#c0392b",marginBottom:12}}>⚠ {error}</div>}
            <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
              <button onClick={onClose} style={{border:"1px solid #e8e4dc",background:"none",borderRadius:6,padding:"9px 16px",fontSize:13,color:"#9b9a97",cursor:"pointer",fontFamily:"'Lora',serif"}}>Cancel</button>
              <button onClick={handleSchedule} disabled={scheduling||!date||!time} style={{background:"#e97942",color:"#fff",border:"none",borderRadius:6,padding:"9px 18px",fontSize:13,cursor:"pointer",fontFamily:"'Lora',serif",fontWeight:600,opacity:scheduling||!date||!time?0.5:1}}>
                {scheduling?"Scheduling…":"Create Meeting →"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({projects,sharedProjects,onOpen,onNew,onDelete,onStatusChange,user,onSignOut,onIdeas,onClients,onMeetings}){
  const[search,setSearch]=useState("");
  const[filter,setFilter]=useState("All");
  const[sidebarOpen,setSidebarOpen]=useState(true);
  const[calendarSettings,setCalendarSettings]=useState(null);
  const[upcomingMeetings,setUpcomingMeetings]=useState([]);
  const[calendarLoading,setCalendarLoading]=useState(false);
  const[calendarMsg,setCalendarMsg]=useState("");
  const[meetingLinking,setMeetingLinking]=useState(null);
  const filtered=[...projects].filter(p=>{const q=search.toLowerCase();const ms=!q||[p.title,p.client_name,p.brief?.projectType].some(s=>s?.toLowerCase().includes(q));return ms&&(filter==="All"||p.status===filter);}).sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at));
  const filteredShared=arr(sharedProjects).filter(p=>{const q=search.toLowerCase();return!q||[p.title,p.client_name,p.brief?.projectType].some(s=>s?.toLowerCase().includes(q));}).sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at));

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    const calConnected=params.get("calendar_connected")==="1";
    const calErr=params.get("calendar_error");
    if(calConnected||calErr)window.history.replaceState({},"",window.location.pathname);
    if(calErr){setCalendarMsg("⚠ "+decodeURIComponent(calErr));}
    if(user?.id){
      if(calConnected){
        // OAuth just completed — fetch recall_calendar_id from Recall.ai and save it
        setCalendarMsg("✓ Google Calendar connected! Setting up auto-join…");
        fetch("/api/google-calendar-auth?action=reconnect-recall",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:user.id})})
          .then(r=>r.json())
          .then(d=>{
            if(d.ok){setCalendarMsg("✓ Google Calendar connected — bot will auto-join your meetings!");}
            else{setCalendarMsg("⚠ Calendar connected but setup incomplete. Try the Meetings tab to retry.");}
          })
          .catch(()=>setCalendarMsg("⚠ Calendar connected but setup incomplete."))
          .finally(()=>loadCalendarSettings());
      } else {
        loadCalendarSettings();
      }
    }
  },[user?.id]);

  async function loadCalendarSettings(){
    const{data}=await supabase.from("user_settings").select("calendar_connected,recall_calendar_id").eq("id",user.id).single();
    setCalendarSettings(data||{calendar_connected:false});
    if(data?.calendar_connected)loadUpcomingMeetings();
  }
  async function loadUpcomingMeetings(){
    setCalendarLoading(true);
    try{const res=await fetch(`/api/google-calendar-auth?action=upcoming-meetings&userId=${user.id}`);const data=await res.json();setUpcomingMeetings(data.meetings||[]);}
    catch(e){console.error("loadUpcomingMeetings:",e.message);}
    setCalendarLoading(false);
  }
  async function handleConnectCalendar(){
    try{const res=await fetch(`/api/google-calendar-auth?action=oauth-url&userId=${user.id}`);const data=await res.json();if(data.url)window.location.href=data.url;}
    catch(e){setCalendarMsg("⚠ "+e.message);}
  }
  async function handleDisconnectCalendar(){
    if(!window.confirm("Disconnect Google Calendar? The bot will stop auto-joining your meetings."))return;
    try{await fetch("/api/google-calendar-auth?action=disconnect",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:user.id})});
    setCalendarSettings({calendar_connected:false});setUpcomingMeetings([]);setCalendarMsg("Calendar disconnected.");}
    catch(e){setCalendarMsg("⚠ "+e.message);}
  }
  async function handleLinkMeeting(meetingId,projectId){
    setMeetingLinking(meetingId);
    try{await fetch("/api/google-calendar-auth?action=link-meeting",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:user.id,meetingId,projectId:projectId||null})});
    setUpcomingMeetings(prev=>prev.map(m=>m.id===meetingId?{...m,linkedProjectId:projectId||null}:m));}
    catch(e){console.error("handleLinkMeeting:",e.message);}
    setMeetingLinking(null);
  }

  function DashSidebar(){return(<>
    <button onClick={()=>setSidebarOpen(false)} style={{display:"flex",alignItems:"center",gap:6,width:"100%",padding:"10px 14px",border:"none",background:"none",cursor:"pointer",fontSize:13,color:"#9b9a97",fontFamily:"'Lora',serif",borderBottom:"1px solid #f1f0ef",marginBottom:16}}>← Close Menu</button>
    <div style={{padding:"0 10px"}}>
      <div style={{fontSize:10,fontFamily:"'IBM Plex Mono',monospace",color:"#c4c3bf",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:12}}>Navigation</div>
      <button onClick={onNew} style={{display:"flex",alignItems:"center",gap:8,width:"100%",padding:"9px 10px",border:"none",background:"#37352f",color:"#fff",borderRadius:6,cursor:"pointer",fontSize:13,fontFamily:"'Lora',serif",marginBottom:8}}>🎬 <span>New Brief</span></button>
      <button onClick={onIdeas} className="nb" style={{marginBottom:4}}><span style={{fontSize:15}}>💡</span><span>Idea Capture</span></button>
      <button onClick={onClients} className="nb" style={{marginBottom:4}}><span style={{fontSize:15}}>👥</span><span>Clients</span></button>
      <div style={{marginTop:24,fontSize:10,fontFamily:"'IBM Plex Mono',monospace",color:"#c4c3bf",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8}}>Calendar</div>
      <button onClick={onMeetings} className="nb" style={{marginBottom:4,position:"relative"}}>
        <span style={{fontSize:15}}>📅</span>
        <span>Meetings</span>
        {calendarSettings?.calendar_connected&&<span style={{width:7,height:7,borderRadius:"50%",background:"#1e7e34",display:"inline-block",marginLeft:"auto",flexShrink:0}}/>}
      </button>
      {calendarSettings?.calendar_connected
        ?<div style={{fontSize:11,color:"#9b9a97",padding:"2px 10px 6px",lineHeight:1.5}}>🤖 Auto-joining · <span style={{cursor:"pointer",textDecoration:"underline"}} onClick={handleDisconnectCalendar}>Disconnect</span></div>
        :null
      }
      {calendarMsg&&<div style={{fontSize:11,padding:"4px 10px",color:calendarMsg.startsWith("✓")?"#1e7e34":"#c0392b",lineHeight:1.4}}>{calendarMsg}</div>}
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
          {calendarSettings?.calendar_connected&&<div style={{marginBottom:20,padding:"12px 16px",background:"#f5f8ff",borderRadius:10,border:"1px solid #e8f0fe",display:"flex",alignItems:"center",gap:10,cursor:"pointer"}} onClick={onMeetings}><span style={{fontSize:20}}>📅</span><div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,color:"#1a56c4"}}>View Upcoming Meetings</div><div style={{fontSize:11,color:"#9b9a97"}}>See your scheduled meetings, bot status, and link follow-ups</div></div><span style={{color:"#1a56c4",fontSize:16}}>→</span></div>}
          <h1 style={{fontSize:26,fontWeight:700,color:"#37352f",marginBottom:20,letterSpacing:"-0.02em"}}>Projects</h1>
          <div style={{display:"flex",gap:10,marginBottom:24,flexWrap:"wrap"}}>
            <div style={{flex:1,minWidth:180,position:"relative"}}><span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:14,color:"#9b9a97"}}>🔍</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search projects…" style={{width:"100%",border:"1px solid #e8e4dc",borderRadius:8,padding:"10px 14px 10px 36px",fontFamily:"'Lora',serif",fontSize:13,color:"#37352f",outline:"none",background:"#fafaf9",boxSizing:"border-box"}} onFocus={e=>e.target.style.borderColor="#37352f"} onBlur={e=>e.target.style.borderColor="#e8e4dc"}/></div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{["All",...STATUSES].map(s=><button key={s} onClick={()=>setFilter(s)} style={{padding:"7px 12px",borderRadius:20,border:"1px solid",borderColor:filter===s?"#37352f":"#e8e4dc",background:filter===s?"#37352f":"transparent",color:filter===s?"#fff":"#9b9a97",fontFamily:"'Lora',serif",fontSize:12,cursor:"pointer",whiteSpace:"nowrap"}}>{s}</button>)}</div>
          </div>
          {filtered.length===0?(<div style={{textAlign:"center",padding:"60px 20px"}}><div style={{fontSize:44,marginBottom:14}}>🎬</div><p style={{fontSize:17,fontWeight:600,color:"#37352f",marginBottom:8}}>{search||filter!=="All"?"No projects match":"No projects yet"}</p><p style={{fontSize:14,color:"#9b9a97",marginBottom:20}}>{search||filter!=="All"?"Try different filters":"Create your first production brief."}</p>{!search&&filter==="All"&&<button onClick={onNew} style={{background:"#37352f",color:"#fff",border:"none",padding:"11px 24px",borderRadius:6,fontFamily:"'Lora',serif",fontSize:14,cursor:"pointer"}}>+ Create First Brief</button>}</div>)
          :(<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(240px, 1fr))",gap:14}}>{filtered.map(p=>(<div key={p.id} onClick={()=>onOpen(p)} style={{border:"1px solid #f1f0ef",borderRadius:10,padding:"18px",background:"#fafaf9",cursor:"pointer",transition:"all .15s"}} onMouseEnter={e=>{e.currentTarget.style.background="#f0ede8";e.currentTarget.style.borderColor="#e0ddd8";}} onMouseLeave={e=>{e.currentTarget.style.background="#fafaf9";e.currentTarget.style.borderColor="#f1f0ef";}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}><span style={{fontSize:26}}>{p.brief?.coverEmoji||"🎬"}</span><div style={{display:"flex",alignItems:"center",gap:6}} onClick={e=>e.stopPropagation()}>{p.share_enabled&&<span style={{fontSize:10,background:"#e8f0fe",color:"#1a56c4",borderRadius:20,padding:"2px 8px",fontWeight:600,fontFamily:"'IBM Plex Mono',monospace",letterSpacing:"0.04em"}}>👥 Shared</span>}<StatusBadge status={p.status} onChange={s=>onStatusChange(p.id,s)}/><button onClick={e=>{e.stopPropagation();if(window.confirm("Delete this project?"))onDelete(p.id);}} style={{background:"none",border:"none",color:"#ddd",cursor:"pointer",fontSize:13,padding:"2px 4px"}} onMouseEnter={e=>e.currentTarget.style.color="#c0392b"} onMouseLeave={e=>e.currentTarget.style.color="#ddd"}>🗑</button></div></div><div style={{fontWeight:700,fontSize:14,color:"#37352f",marginBottom:4,lineHeight:1.3}}>{p.title||"Untitled"}</div><div style={{fontSize:12,color:"#9b9a97",marginBottom:8}}>{p.client_name}{p.brief?.projectType?` · ${p.brief.projectType}`:""}</div><div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}>{arr(p.brief?.concepts).map((c,i)=><span key={i} style={{fontSize:11,background:"#f1f0ef",borderRadius:20,padding:"2px 8px",color:"#9b9a97"}}>{c.emoji} {c.title}</span>)}</div>{p.doc_count>0&&<div style={{fontSize:11,color:"#9b9a97",marginBottom:4}}>📎 {p.doc_count} doc{p.doc_count>1?"s":""}</div>}<div style={{fontSize:11,color:"#c4c3bf",fontFamily:"'IBM Plex Mono',monospace"}}>Updated {new Date(p.updated_at).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</div></div>))}</div>)}

          {/* Shared with you section */}
          {filteredShared.length>0&&(<div style={{marginTop:40}}><h2 style={{fontSize:18,fontWeight:700,color:"#37352f",marginBottom:16,letterSpacing:"-0.02em",display:"flex",alignItems:"center",gap:8}}>👥 Shared with you</h2><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(240px, 1fr))",gap:14}}>{filteredShared.map(p=>(<div key={p.id} onClick={()=>onOpen({...p,_sharedRole:p.myRole})} style={{border:"1px solid #e8f0fe",borderRadius:10,padding:"18px",background:"#f5f8ff",cursor:"pointer",transition:"all .15s"}} onMouseEnter={e=>{e.currentTarget.style.background="#ebf1ff";e.currentTarget.style.borderColor="#c5d8fb";}} onMouseLeave={e=>{e.currentTarget.style.background="#f5f8ff";e.currentTarget.style.borderColor="#e8f0fe";}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}><span style={{fontSize:26}}>{p.brief?.coverEmoji||"🎬"}</span><span style={{fontSize:10,background:p.myRole==="editor"?"#fdeee4":"#e8f0fe",color:p.myRole==="editor"?"#b94a1a":"#1a56c4",borderRadius:20,padding:"2px 8px",fontWeight:600,fontFamily:"'IBM Plex Mono',monospace",letterSpacing:"0.04em",textTransform:"capitalize"}}>{p.myRole==="editor"?"✏️ Editor":"👁 Viewer"}</span></div><div style={{fontWeight:700,fontSize:14,color:"#37352f",marginBottom:4,lineHeight:1.3}}>{p.title||"Untitled"}</div><div style={{fontSize:12,color:"#9b9a97",marginBottom:8}}>{p.client_name}{p.brief?.projectType?` · ${p.brief.projectType}`:""}</div><div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}>{arr(p.brief?.concepts).map((c,i)=><span key={i} style={{fontSize:11,background:"#e8f0fe",borderRadius:20,padding:"2px 8px",color:"#1a56c4"}}>{c.emoji} {c.title}</span>)}</div><div style={{fontSize:11,color:"#c4c3bf",fontFamily:"'IBM Plex Mono',monospace"}}>Updated {new Date(p.updated_at).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</div></div>))}</div></div>)}
        </div>
      </div>
    </div>
  );
}

// ─── AI CHAT ─────────────────────────────────────────────────────────────────
function AIChatPanel({chatLog,onSend,busy,onClose,hideHeader}){
  const[input,setInput]=useState("");
  const[interimText,setInterimText]=useState("");
  const taRef=useRef();const endRef=useRef();
  useEffect(()=>{endRef.current?.scrollIntoView({behavior:"smooth"});},[chatLog,busy]);
  useEffect(()=>{const ta=taRef.current;if(!ta)return;ta.style.height="auto";ta.style.height=Math.min(ta.scrollHeight,160)+"px";},[input]);
  function send(){const text=(input+(interimText?" "+interimText:"")).trim();if(!text||busy)return;onSend(text);setInput("");setInterimText("");if(taRef.current)taRef.current.style.height="auto";}
  return(
    <div style={{display:"flex",flexDirection:"column",height:"100%",background:"#fafaf9"}}>
      {!hideHeader&&<div style={{padding:"14px 18px",borderBottom:"1px solid #f1f0ef",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
        <div><div style={{fontSize:13,fontWeight:700,color:"#37352f",marginBottom:2}}>✦ AI Creative Director</div><div style={{fontSize:12,color:"#9b9a97"}}>Full chat history remembered</div></div>
        <button onClick={onClose} style={{background:"none",border:"none",color:"#9b9a97",cursor:"pointer",fontSize:20,lineHeight:1,padding:"2px 4px"}}>✕</button>
      </div>}
      <div style={{flex:1,overflowY:"auto",padding:"16px",display:"flex",flexDirection:"column",gap:12}}>
        {chatLog.length===0&&(<div style={{marginTop:24}}><p style={{color:"#c4c3bf",fontSize:13,textAlign:"center",lineHeight:1.9,fontStyle:"italic",marginBottom:16}}>I remember everything we discuss. Try:</p>{["Add a drone shot to the shot list","Make the script hook more emotional","Add a rooftop location","Create a new social content concept"].map(s=>(<button key={s} onClick={()=>{setInput(s);taRef.current?.focus();}} style={{display:"block",width:"100%",textAlign:"left",background:"#fff",border:"1px solid #f1f0ef",borderRadius:8,padding:"9px 12px",fontSize:12,color:"#55534e",cursor:"pointer",fontFamily:"'Lora',serif",marginBottom:6}} onMouseEnter={e=>{e.currentTarget.style.background="#f7f6f3";e.currentTarget.style.borderColor="#e0ddd8";}} onMouseLeave={e=>{e.currentTarget.style.background="#fff";e.currentTarget.style.borderColor="#f1f0ef";}}>{s}</button>))}</div>)}
        {chatLog.map((m,i)=>{if(m.role==="system")return(<div key={i} style={{display:"flex",justifyContent:"center"}}><span style={{fontSize:11,color:"#1e7e34",background:"#e6f4ea",borderRadius:20,padding:"3px 12px",fontWeight:600}}>✓ Brief updated</span></div>);return(<div key={i} style={{display:"flex",flexDirection:m.role==="user"?"row-reverse":"row",gap:8}}>{m.role==="assistant"&&<div style={{width:24,height:24,borderRadius:"50%",background:"#37352f",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,flexShrink:0,marginTop:2,color:"#fff"}}>✦</div>}<div style={{maxWidth:"82%",background:m.role==="user"?"#37352f":"#fff",color:m.role==="user"?"#fff":"#37352f",borderRadius:m.role==="user"?"12px 12px 4px 12px":"12px 12px 12px 4px",padding:"10px 14px",fontSize:13,lineHeight:1.65,border:m.role==="assistant"?"1px solid #f1f0ef":"none",wordBreak:"break-word"}}>{m.content}</div></div>);})}
        {busy&&<div style={{display:"flex",gap:8,alignItems:"center"}}><div style={{width:24,height:24,borderRadius:"50%",background:"#37352f",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,flexShrink:0,color:"#fff"}}>✦</div><div style={{background:"#fff",border:"1px solid #f1f0ef",borderRadius:"12px 12px 12px 4px",padding:"10px 14px",display:"flex",gap:4}}>{[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:"#c4c3bf",animation:`bounce 1.2s ${i*0.2}s infinite`}}/>)}</div></div>}
        <div ref={endRef}/>
      </div>
      <div style={{padding:"12px 14px",borderTop:"1px solid #f1f0ef",background:"#fff",flexShrink:0}}>
        <div style={{border:"1px solid #e8e4dc",borderRadius:10,overflow:"hidden"}} onFocusCapture={e=>e.currentTarget.style.borderColor="#37352f"} onBlurCapture={e=>e.currentTarget.style.borderColor="#e8e4dc"}>
          <textarea ref={taRef} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&(e.preventDefault(),send())} placeholder="Ask or say anything… (Enter to send)" style={{width:"100%",border:"none",outline:"none",padding:"12px 14px",fontSize:13,color:"#37352f",fontFamily:"'Lora',serif",lineHeight:1.6,resize:"none",background:"transparent",minHeight:44,maxHeight:160,overflowY:"auto",display:"block"}}/>
          {interimText&&<div style={{padding:"0 14px 8px",fontSize:12,color:"#9b9a97",fontStyle:"italic",lineHeight:1.5}}>{interimText}…</div>}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"stretch",padding:"8px 12px",borderTop:"1px solid #f1f0ef"}}>
            <VoiceMicBtn onTranscript={(final,interim)=>{setInput(final);setInterimText(interim);}}/>
            <button onClick={send} disabled={!(input+interimText).trim()||busy} style={{background:"#37352f",color:"#fff",border:"none",borderRadius:8,padding:"0 16px",fontSize:13,cursor:"pointer",fontFamily:"'Lora',serif",opacity:!(input+interimText).trim()||busy?0.4:1,flexShrink:0,display:"flex",alignItems:"center",lineHeight:1}}>Send ↑</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── SHARE MODAL ──────────────────────────────────────────────────────────────
function ShareModal({project,user,onClose,onProjectUpdate}){
  const[members,setMembers]=useState([]);
  const[loading,setLoading]=useState(true);
  const[shareEnabled,setShareEnabled]=useState(project?.share_enabled||false);
  const[copied,setCopied]=useState(false);
  const[inviteEmail,setInviteEmail]=useState("");
  const[inviteRole,setInviteRole]=useState("editor");
  const[inviting,setInviting]=useState(false);
  const[inviteMsg,setInviteMsg]=useState("");
  const[removing,setRemoving]=useState(null);
  const shareUrl=`https://framebriefai.com/share/${project?.id}`;
  useEffect(()=>{if(project?.id)loadMembers();},[project?.id]);
  async function loadMembers(){
    setLoading(true);
    const{data}=await supabase.from("project_members").select("*").eq("project_id",project.id).order("created_at");
    setMembers(data||[]);setLoading(false);
  }
  async function toggleShare(){
    const v=!shareEnabled;setShareEnabled(v);
    const{data}=await supabase.from("projects").update({share_enabled:v,updated_at:new Date().toISOString()}).eq("id",project.id).select().single();
    if(data)onProjectUpdate(data);
  }
  async function copyLink(){
    if(!shareEnabled){const v=true;setShareEnabled(v);const{data}=await supabase.from("projects").update({share_enabled:v,updated_at:new Date().toISOString()}).eq("id",project.id).select().single();if(data)onProjectUpdate(data);}
    navigator.clipboard.writeText(shareUrl).catch(()=>{});setCopied(true);setTimeout(()=>setCopied(false),2500);
  }
  async function sendInvite(){
    if(!inviteEmail.trim())return;
    setInviting(true);setInviteMsg("");
    try{
      const res=await fetch("/api/invite",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({projectId:project.id,invitedEmail:inviteEmail.trim().toLowerCase(),role:inviteRole,invitedBy:user.id,projectTitle:project.title})});
      const data=await res.json();
      if(!res.ok){setInviteMsg(data.error||"Failed to invite");}
      else{setInviteMsg("✓ Invite sent!");setInviteEmail("");loadMembers();}
    }catch(e){setInviteMsg("Error: "+e.message);}
    setInviting(false);
  }
  async function removeMember(memberId){
    setRemoving(memberId);
    await fetch("/api/invite",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({memberId,requesterId:user.id,projectId:project.id})});
    await loadMembers();setRemoving(null);
  }
  const pill={fontSize:11,borderRadius:20,padding:"2px 8px",fontWeight:600};
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:460,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.22)"}}>
        <div style={{padding:"20px 24px 16px",borderBottom:"1px solid #f1f0ef",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
          <div><div style={{fontWeight:700,fontSize:15,color:"#37352f"}}>Share Brief</div><div style={{fontSize:12,color:"#9b9a97",marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:300}}>{project?.title}</div></div>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#9b9a97",padding:"4px",lineHeight:1,flexShrink:0}}>✕</button>
        </div>
        <div style={{padding:"20px 24px"}}>
          {/* Share link */}
          <div style={{marginBottom:22}}>
            <div style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10}}>View-Only Link</div>
            <div style={{display:"flex",gap:8,marginBottom:10}}>
              <input readOnly value={shareUrl} style={{flex:1,border:"1px solid #e8e4dc",borderRadius:6,padding:"8px 10px",fontSize:11,color:shareEnabled?"#37352f":"#c4c3bf",fontFamily:"'IBM Plex Mono',monospace",background:"#fafaf9",outline:"none",minWidth:0}}/>
              <button onClick={copyLink} style={{background:"#37352f",color:"#fff",border:"none",borderRadius:6,padding:"8px 16px",fontSize:12,cursor:"pointer",fontFamily:"'Lora',serif",flexShrink:0,whiteSpace:"nowrap"}}>{copied?"✓ Copied!":"Copy Link"}</button>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div onClick={toggleShare} style={{width:34,height:20,borderRadius:10,background:shareEnabled?"#e97942":"#d4d0c8",cursor:"pointer",position:"relative",transition:"background .2s",flexShrink:0}}>
                <div style={{position:"absolute",top:3,left:shareEnabled?15:3,width:14,height:14,borderRadius:"50%",background:"#fff",boxShadow:"0 1px 3px rgba(0,0,0,0.25)",transition:"left .2s"}}/>
              </div>
              <span style={{fontSize:12,color:"#55534e"}}>{shareEnabled?"Anyone with this link can view this project":"Enable link to share"}</span>
            </div>
          </div>
          {/* Invite */}
          <div style={{marginBottom:22}}>
            <div style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10}}>Invite Collaborator</div>
            <div style={{display:"flex",gap:6,marginBottom:6,flexWrap:"wrap"}}>
              <input value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendInvite()} placeholder="Email address" type="email" style={{flex:"1 1 160px",border:"1px solid #e8e4dc",borderRadius:6,padding:"8px 10px",fontSize:13,fontFamily:"'Lora',serif",outline:"none",color:"#37352f",minWidth:0}} onFocus={e=>e.target.style.borderColor="#37352f"} onBlur={e=>e.target.style.borderColor="#e8e4dc"}/>
              <select value={inviteRole} onChange={e=>setInviteRole(e.target.value)} style={{border:"1px solid #e8e4dc",borderRadius:6,padding:"8px 10px",fontSize:13,fontFamily:"'Lora',serif",background:"#fff",outline:"none",color:"#37352f",cursor:"pointer",flexShrink:0}}>
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
              <button onClick={sendInvite} disabled={!inviteEmail.trim()||inviting} style={{background:"#37352f",color:"#fff",border:"none",borderRadius:6,padding:"8px 14px",fontSize:12,cursor:"pointer",fontFamily:"'Lora',serif",flexShrink:0,opacity:!inviteEmail.trim()||inviting?0.4:1}}>{inviting?"Sending…":"Invite"}</button>
            </div>
            {inviteMsg&&<div style={{fontSize:12,color:inviteMsg.startsWith("✓")?"#1e7e34":"#c0392b",marginBottom:4}}>{inviteMsg}</div>}
            <div style={{fontSize:11,color:"#c4c3bf"}}>Editor can make changes · Viewer can only read</div>
          </div>
          {/* Access list */}
          <div>
            <div style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10}}>Who Has Access</div>
            <div style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:"1px solid #f1f0ef"}}>
              <div style={{width:32,height:32,borderRadius:"50%",background:"#37352f",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0}}>👑</div>
              <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:"#37352f"}}>{user?.email}</div><div style={{fontSize:11,color:"#9b9a97"}}>Owner</div></div>
            </div>
            {loading?<div style={{fontSize:12,color:"#c4c3bf",padding:"14px 0",textAlign:"center"}}>Loading…</div>:members.map(m=>(
              <div key={m.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:"1px solid #f1f0ef"}}>
                <div style={{width:32,height:32,borderRadius:"50%",background:m.role==="editor"?"#fdeee4":"#e8f0fe",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0}}>{m.role==="editor"?"✏️":"👁"}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,color:"#37352f",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.invited_email}</div>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginTop:2}}>
                    <span style={{...pill,background:m.role==="editor"?"#fdeee4":"#e8f0fe",color:m.role==="editor"?"#b94a1a":"#1a56c4",textTransform:"capitalize"}}>{m.role}</span>
                    <span style={{fontSize:11,color:m.user_id?"#1e7e34":"#9b9a97"}}>{m.user_id?"✓ Joined":"Invite pending"}</span>
                  </div>
                </div>
                <button onClick={()=>removeMember(m.id)} disabled={removing===m.id} style={{background:"none",border:"1px solid #f1f0ef",borderRadius:6,padding:"4px 10px",fontSize:11,color:"#9b9a97",cursor:"pointer",fontFamily:"'Lora',serif",flexShrink:0,transition:"all .15s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor="#c0392b";e.currentTarget.style.color="#c0392b";}} onMouseLeave={e=>{e.currentTarget.style.borderColor="#f1f0ef";e.currentTarget.style.color="#9b9a97";}}>{removing===m.id?"…":"Remove"}</button>
              </div>
            ))}
            {!loading&&members.length===0&&<div style={{fontSize:12,color:"#c4c3bf",padding:"14px 0",textAlign:"center",fontStyle:"italic"}}>No collaborators yet.</div>}
          </div>
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
  const[aiEditing,setAiEditing]=useState(false);
  const[showShareModal,setShowShareModal]=useState(false);
  const[sharedProjects,setSharedProjects]=useState([]);
  const[myRole,setMyRole]=useState("owner");
  const[shareProjectId,setShareProjectId]=useState(null);
  const[sharedIdeaData,setSharedIdeaData]=useState(null);
  const[sharedIdeaLoading,setSharedIdeaLoading]=useState(false);
  const[copied,setCopied]=useState(false);
  const[dbSaving,setDbSaving]=useState(false);
  const[clients,setClients]=useState([]);
  const[activeClientId,setActiveClientId]=useState(null);
  const[inputClientId,setInputClientId]=useState(null);
  const[newClientNameInput,setNewClientNameInput]=useState("");
  const[viewingMeeting,setViewingMeeting]=useState(null);
  const[viewingMeetingIdx,setViewingMeetingIdx]=useState(null);
  const[meetingNotesExpanded,setMeetingNotesExpanded]=useState(false);
  const[pendingMeeting,setPendingMeeting]=useState(null);
  const[briefGenError,setBriefGenError]=useState(false);
  const[reviewingMeeting,setReviewingMeeting]=useState(null);
  const[showAddMeeting,setShowAddMeeting]=useState(false);
  const[addMeetingTranscript,setAddMeetingTranscript]=useState("");
  const[addMeetingLoading,setAddMeetingLoading]=useState(false);
  const[addMeetingError,setAddMeetingError]=useState("");
  const[showJoinCall,setShowJoinCall]=useState(false);
  const[joinCallUrl,setJoinCallUrl]=useState("");
  const[joinCallLoading,setJoinCallLoading]=useState(false);
  const[joinCallError,setJoinCallError]=useState("");
  const[showConsultationModal,setShowConsultationModal]=useState(false);
  const[showScheduleConsultation,setShowScheduleConsultation]=useState(false);
  const[moreMenuOpen,setMoreMenuOpen]=useState(false);
  const brief=activeProject?.brief||null;

  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>{setUser(session?.user??null);setAuthLoading(false);});
    const{data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{setUser(session?.user??null);});
    // Close mobile drawer if window resizes to desktop
    const handleResize = () => { if(window.innerWidth > 768){setSidebarOpen(false);} };
    window.addEventListener('resize', handleResize);
    return()=>{ subscription.unsubscribe(); window.removeEventListener('resize', handleResize); };
  },[]);

  // Detect /share/{id} and /idea/{id} URLs on mount
  useEffect(()=>{
    const m=window.location.pathname.match(/^\/share\/([^/?]+)/);
    if(m)setShareProjectId(m[1]);
    const mi=window.location.pathname.match(/^\/idea\/([^/?]+)/);
    if(mi){
      setSharedIdeaLoading(true);
      supabase.from("shared_ideas").select("*").eq("id",mi[1]).single().then(({data,error})=>{
        setSharedIdeaLoading(false);
        if(!error&&data){setSharedIdeaData(data.idea);setScreen("sharedIdea");}
        else setScreen("dashboard");
      });
    }
  },[]);

  useEffect(()=>{if(user){loadProjects();loadSharedProjects();loadClients();}},[user]);

  // Load shared project once auth resolves
  useEffect(()=>{
    if(!shareProjectId||authLoading)return;
    loadShareRoute(shareProjectId);
  },[shareProjectId,authLoading]); // eslint-disable-line

  // Initialize pendingMeeting when opening a project that already has brief_pending_review status
  useEffect(()=>{
    if(activeProject?.recall_status==="brief_pending_review"){
      const history=arr(activeProject.meeting_history);
      const pending=history.find(m=>m.status==="pending_review");
      if(pending)setPendingMeeting(pending);
    }
  },[activeProject?.id, activeProject?.recall_status]); // eslint-disable-line

  // Poll for transcript/brief when bot is in a meeting
  useEffect(()=>{
    const pollStatuses = ["bot_joined", "transcribing", "transcript_ready"];
    if(!activeProject?.id || !pollStatuses.includes(activeProject?.recall_status)) return;
    const interval = setInterval(async () => {
      const { data } = await supabase.from("projects").select("*").eq("id", activeProject.id).single();
      if (!data) return;
      // Always sync latest data so the UI reflects current status
      setActiveProject(prev => ({...prev, ...data}));
      setProjects(ps => ps.map(p => p.id === activeProject.id ? {...p, ...data} : p));
      if (data.recall_status === "brief_ready" || data.recall_status === "transcription_failed" || data.recall_status === "transcription_error") {
        clearInterval(interval);
      }
      // Consultation meeting ready for review
      if (data.recall_status === "brief_pending_review") {
        const history = arr(data.meeting_history);
        const pending = history.find(m => m.status === "pending_review");
        if (pending) setPendingMeeting(pending);
        clearInterval(interval);
      }
      // Auto-trigger brief generation when transcript is ready
      if (data.recall_status === "transcript_ready" && data.recall_transcript) {
        clearInterval(interval);
        setActiveProject(prev => ({...prev, ...data}));
        setProjects(ps => ps.map(p => p.id === data.id ? {...p, ...data} : p));
        generateBriefFromTranscript(data);
      }
    }, 5000); // poll every 5s
    return () => clearInterval(interval);
  },[activeProject?.id, activeProject?.recall_status]);

  async function loadProjects(){
    const{data,error}=await supabase.from("projects").select("*").order("updated_at",{ascending:false});
    if(!error&&data)setProjects(data);
  }

  async function loadSharedProjects(){
    if(!user)return;
    const{data}=await supabase.from("project_members").select("role,projects(*)").eq("user_id",user.id);
    if(data)setSharedProjects(data.filter(m=>m.projects).map(m=>({...m.projects,myRole:m.role})));
  }

  async function loadClients(){
    const{data,error}=await supabase.from("clients").select("*").order("name",{ascending:true});
    if(!error&&data)setClients(data);
  }

  async function loadShareRoute(pid){
    const{data,error}=await supabase.from("projects").select("*").eq("id",pid).single();
    if(error||!data){setScreen("dashboard");return;}
    let role="viewer";
    if(user){
      if(data.user_id===user.id){role="owner";}
      else{
        const{data:mem}=await supabase.from("project_members").select("role").eq("project_id",pid).eq("user_id",user.id).single();
        if(mem)role=mem.role;
      }
    }
    setMyRole(role);
    setActiveProject(data);
    setPage("overview");
    setShareMode(role==="viewer"||!user);
    setChatLog([]);setChatOpen(false);setSidebarOpen(false);
    setScreen("doc");
  }

  async function saveProject(projectData){
    setDbSaving(true);
    const isOwner=!user||user.id===projectData.user_id;
    let data,error;
    if(isOwner){
      ({data,error}=await supabase.from("projects").upsert({id:projectData.id,user_id:user.id,title:projectData.brief?.projectTitle||"Untitled",client_name:projectData.brief?.clientName||"",status:projectData.status||"Draft",brief:projectData.brief||{},doc_count:projectData.doc_count||0,client_id:projectData.client_id||null,meeting_stage:projectData.meeting_stage||"discovery",meeting_history:projectData.meeting_history||[],call_sheet:projectData.call_sheet||{},post_production:projectData.post_production||{},updated_at:new Date().toISOString()}).select().single());
      // If new lifecycle columns don't exist yet, fall back to saving without them
      if(error){
        console.warn("saveProject: full upsert failed, retrying without lifecycle columns:",error.message);
        ({data,error}=await supabase.from("projects").upsert({id:projectData.id,user_id:user.id,title:projectData.brief?.projectTitle||"Untitled",client_name:projectData.brief?.clientName||"",status:projectData.status||"Draft",brief:projectData.brief||{},doc_count:projectData.doc_count||0,client_id:projectData.client_id||null,updated_at:new Date().toISOString()}).select().single());
      }
    }else{
      ({data,error}=await supabase.from("projects").update({title:projectData.brief?.projectTitle||"Untitled",client_name:projectData.brief?.clientName||"",brief:projectData.brief||{},updated_at:new Date().toISOString()}).eq("id",projectData.id).select().single());
    }
    setDbSaving(false);
    if(!error&&data){setProjects(ps=>{const existing=ps.find(p=>p.id===data.id);return existing?ps.map(p=>p.id===data.id?data:p):[data,...ps];});return data;}
    return null;
  }

  async function deleteProject(id){
    await supabase.from("projects").delete().eq("id",id);
    setProjects(ps=>ps.filter(p=>p.id!==id));
    if(activeProject?.id===id){setActiveProject(null);setScreen("dashboard");}
  }

  function linkClientToProject(client){
    setActiveProject(prev=>{
      const updatedBrief={...prev.brief,clientName:client.name};
      const updated={...prev,client_id:client.id,brief:updatedBrief};
      clearTimeout(window._briefSaveTimer);
      window._briefSaveTimer=setTimeout(()=>saveProject(updated),1500);
      return updated;
    });
    setProjects(ps=>ps.map(p=>p.id===activeProject?.id?{...p,client_id:client.id,client_name:client.name}:p));
  }

  function unlinkClientFromProject(){
    setActiveProject(prev=>{
      const updated={...prev,client_id:null};
      clearTimeout(window._briefSaveTimer);
      window._briefSaveTimer=setTimeout(()=>saveProject(updated),1500);
      return updated;
    });
    setProjects(ps=>ps.map(p=>p.id===activeProject?.id?{...p,client_id:null}:p));
  }

  async function createAndLinkClient(name){
    const{data}=await supabase.from("clients").insert({name,user_id:user.id}).select().single();
    if(data){
      setClients(prev=>[...prev,data].sort((a,b)=>a.name.localeCompare(b.name)));
      linkClientToProject(data);
    }
  }

  async function handleJoinCall(){
    if(!joinCallUrl.trim()||!activeProject)return;
    setJoinCallLoading(true);setJoinCallError("");
    try{
      const bot=await startRecallBot(joinCallUrl.trim(),activeProject.id);
      const botId=bot.botId||bot.id;
      const updated={...activeProject,recall_bot_id:botId,recall_status:"bot_joined"};
      setActiveProject(updated);
      setProjects(ps=>ps.map(p=>p.id===activeProject.id?updated:p));
      await supabase.from("projects").update({recall_bot_id:botId,recall_status:"bot_joined",updated_at:new Date().toISOString()}).eq("id",activeProject.id);
      // Close modal after short delay so user sees the "joining" state
      setTimeout(()=>{setShowJoinCall(false);setJoinCallUrl("");setJoinCallLoading(false);},1800);
    }catch(err){
      setJoinCallError(err.message||"Failed to start bot — check the meeting URL");
      setJoinCallLoading(false);
    }
  }

  async function processManualMeeting(transcriptText){
    if(!activeProject||!transcriptText.trim())return;
    setAddMeetingLoading(true);
    setAddMeetingError("");
    try{
      const hasExistingBrief=arr(activeProject.brief?.concepts).length>0;
      const stageHint=activeProject.meeting_stage||"discovery";
      const system=`You are a creative director AI. Analyze this meeting transcript for a production project. Return ONLY valid JSON with no markdown fences. Keep all string values short — no long passages of text in any field:
{"stage":"discovery|consultation|shoot_day|post_production","summary":"2-3 sentence summary","keyPoints":["",""],"suggestedChanges":[{"field":"fieldName","description":"what to change","before":"old value","after":"new value"}],"briefUpdates":{}}
${hasExistingBrief?"suggestedChanges lists specific changes to the existing brief. briefUpdates is a partial brief update (only changed fields, plain short values).":"If this is a discovery meeting, briefUpdates can be the full brief structure with concise values."}`;
      // Cap transcript sent to AI at 8000 chars to keep response size manageable; full text is still saved below
      const transcriptForAI=transcriptText.slice(0,8000);
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","anthropic-dangerous-direct-browser-access":"true","x-api-key":API_KEY,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:MODEL,max_tokens:4000,system,messages:[{role:"user",content:`Current project: ${JSON.stringify(activeProject.brief)}\n\nTranscript:\n${transcriptForAI}`}]})});
      const aiData=await res.json();
      const raw=(aiData.content||[]).map(b=>b.text||"").join("").trim();
      const s=raw.indexOf("{"),e=raw.lastIndexOf("}");
      if(s===-1||e===-1)throw new Error("No JSON in response");
      // Clean common JSON issues: unescaped control characters inside string values
      const cleaned=raw.slice(s,e+1).replace(/[\x00-\x1F\x7F]/g,ch=>ch==="\n"?"\\n":ch==="\r"?"\\r":ch==="\t"?"\\t":"");
      let parsed;
      try{parsed=JSON.parse(cleaned);}
      catch(pe){
        // Last resort: extract just the scalar fields we need
        console.error("processManualMeeting JSON parse failed, attempting field extraction:",pe.message);
        const get=(key)=>{const m=raw.match(new RegExp(`"${key}"\\s*:\\s*"([^"\\\\]*(\\\\.[^"\\\\]*)*)"`,));return m?m[1]:"";};
        parsed={stage:get("stage")||stageHint,summary:get("summary")||"Meeting processed — review transcript for details.",keyPoints:[],suggestedChanges:[],briefUpdates:null};
      }
      const meeting={id:`m-${Date.now()}`,date:new Date().toISOString(),stage:parsed.stage||stageHint,summary:parsed.summary||"",keyPoints:arr(parsed.keyPoints),suggestedChanges:arr(parsed.suggestedChanges),briefUpdates:parsed.briefUpdates||null,transcriptExcerpt:transcriptText.slice(0,500),transcriptText,status:"pending_review"};
      const newHistory=[...arr(activeProject.meeting_history),meeting];
      const updatedProject={...activeProject,meeting_stage:parsed.stage||stageHint,meeting_history:newHistory};
      setActiveProject(updatedProject);
      setProjects(ps=>ps.map(p=>p.id===activeProject.id?updatedProject:p));
      await supabase.from("projects").update({meeting_stage:parsed.stage||stageHint,meeting_history:newHistory,updated_at:new Date().toISOString()}).eq("id",activeProject.id);
      setPendingMeeting(meeting);
      setShowAddMeeting(false);
      setAddMeetingTranscript("");
    }catch(err){
      console.error("processManualMeeting error:",err);
      setAddMeetingError(err.message||"Failed to process meeting. Please try again.");
    }
    setAddMeetingLoading(false);
  }

  // Simple scalar brief fields that can be patched directly from suggestedChanges.after
  const SIMPLE_BRIEF_FIELDS=new Set(["budget","timeline","projectType","logline","overview","generalNotes","moodDescription","deliverableFormat","date","clientName","projectTitle"]);

  async function applyMeetingChanges(meeting,selectedIndices){
    if(!activeProject)return;
    const changes=arr(meeting.suggestedChanges);
    const appliedChanges=changes.map((c,i)=>({...c,applied:selectedIndices.includes(i)}));
    let updatedBrief={...activeProject.brief};
    if(meeting.briefUpdates&&typeof meeting.briefUpdates==="object"&&Object.keys(meeting.briefUpdates).length>0){
      // Apply structured brief updates (concepts merge by id, everything else spread)
      updatedBrief={...updatedBrief,...meeting.briefUpdates};
      if(meeting.briefUpdates.concepts&&Array.isArray(meeting.briefUpdates.concepts)&&arr(updatedBrief.concepts).length>0){
        const byId={};meeting.briefUpdates.concepts.forEach(c=>{if(c.id)byId[c.id]=c;});
        updatedBrief.concepts=arr(activeProject.brief.concepts).map(c=>byId[c.id]?{...c,...byId[c.id]}:c);
        // Append any brand-new concepts (ids not in existing brief)
        const existingIds=new Set(arr(activeProject.brief.concepts).map(c=>c.id));
        meeting.briefUpdates.concepts.filter(c=>c.id&&!existingIds.has(c.id)).forEach(c=>updatedBrief.concepts.push(c));
      }
    } else {
      // Fallback: apply selected suggestedChanges for simple scalar fields
      selectedIndices.forEach(i=>{
        const c=changes[i];
        if(c&&c.field&&c.after&&SIMPLE_BRIEF_FIELDS.has(c.field)){
          updatedBrief[c.field]=c.after;
        }
      });
    }
    const updatedMeeting={...meeting,suggestedChanges:appliedChanges,status:"reviewed"};
    const newHistory=arr(activeProject.meeting_history).map(m=>m.id===meeting.id?updatedMeeting:m);
    const updatedProject={...activeProject,brief:updatedBrief,meeting_history:newHistory,recall_status:null};
    setActiveProject(updatedProject);
    setProjects(ps=>ps.map(p=>p.id===activeProject.id?updatedProject:p));
    clearTimeout(window._briefSaveTimer);
    await saveProject(updatedProject);
    await supabase.from("projects").update({meeting_history:newHistory,recall_status:null,updated_at:new Date().toISOString()}).eq("id",activeProject.id);
    setPendingMeeting(null);
  }

  async function dismissMeeting(meeting){
    if(!activeProject)return;
    const updatedMeeting={...meeting,status:"dismissed"};
    const newHistory=arr(activeProject.meeting_history).map(m=>m.id===meeting.id?updatedMeeting:m);
    const updatedProject={...activeProject,meeting_history:newHistory,recall_status:null};
    setActiveProject(updatedProject);
    setProjects(ps=>ps.map(p=>p.id===activeProject.id?updatedProject:p));
    await supabase.from("projects").update({meeting_history:newHistory,recall_status:null,updated_at:new Date().toISOString()}).eq("id",activeProject.id);
    setPendingMeeting(null);
  }

  async function moveMeetingToProject(meeting,targetProjectId){
    if(!activeProject||!targetProjectId)return;
    const meetingToMove={...meeting,status:meeting.status==="pending_review"?"reviewed":meeting.status};
    // Fetch target project's current meeting_history fresh from Supabase
    const{data:targetData,error:fetchErr}=await supabase.from("projects").select("meeting_history").eq("id",targetProjectId).single();
    if(fetchErr){console.error("moveMeeting fetch target error:",fetchErr.message);alert("Could not load target project. Please try again.");return;}
    const targetHistory=[...arr(targetData?.meeting_history),meetingToMove];
    // Update TARGET first — if this fails, source is untouched and meeting is safe
    const tgtRes=await supabase.from("projects").update({meeting_history:targetHistory,updated_at:new Date().toISOString()}).eq("id",targetProjectId);
    if(tgtRes.error){console.error("moveMeeting target update error:",tgtRes.error.message);alert("Failed to move meeting to target project. Please try again.");return;}
    // Target confirmed — now remove from source
    const sourceHistory=arr(activeProject.meeting_history).filter(m=>m.id!==meeting.id);
    const srcRes=await supabase.from("projects").update({meeting_history:sourceHistory,updated_at:new Date().toISOString()}).eq("id",activeProject.id);
    if(srcRes.error){console.error("moveMeeting source update error:",srcRes.error.message);alert("Meeting copied to target project but could not be removed from this project. Please delete it here manually.");return;}
    // Both succeeded — update local state
    const updatedSource={...activeProject,meeting_history:sourceHistory};
    setActiveProject(updatedSource);
    setProjects(ps=>ps.map(p=>p.id===activeProject.id?updatedSource:p.id===targetProjectId?{...p,meeting_history:targetHistory}:p));
    setViewingMeeting(null);setViewingMeetingIdx(null);setMeetingNotesExpanded(false);
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

  async function generateBriefFromTranscript(project){
    const proj=project||activeProject;
    if(!proj?.id)return;
    setBriefGenError(false);
    setLoadMsg("Generating brief from transcript…");
    setScreen("loading");
    try{
      // Route through serverless function — triggers brief generation and returns immediately
      const res=await fetch("/api/recall-webhook?action=fetch-transcript",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({projectId:proj.id,botId:proj.recall_bot_id||""}),
      });
      let d={};
      try{d=await res.json();}catch{}
      if(!res.ok)throw new Error(d.message||"Server error — please try again");
      // Server returns immediately with status "generating" — poll Supabase until brief is ready
      setLoadMsg("AI is writing your brief…");
      let attempts=0;
      while(attempts<30){
        await new Promise(r=>setTimeout(r,3000));
        attempts++;
        const{data:updated}=await supabase.from("projects").select("*").eq("id",proj.id).single();
        if(updated?.recall_status==="brief_ready"||updated?.recall_status==="brief_pending_review"||(updated?.brief&&Array.isArray(updated.brief?.concepts)&&updated.brief.concepts.length>0)){
          setActiveProject(updated);
          setProjects(ps=>ps.map(p=>p.id===proj.id?updated:p));
          setPage("overview");setScreen("doc");
          return;
        }
        if(updated?.recall_status==="brief_error"||updated?.recall_status==="transcription_failed"){
          throw new Error("Brief generation failed on server");
        }
      }
      throw new Error("Brief generation timed out — please try again");
    }catch(err){
      console.error("generateBriefFromTranscript error:",err);
      setBriefGenError(true);
      setScreen("doc");
    }
  }
  const generateBriefFromSavedTranscript=()=>generateBriefFromTranscript(activeProject);

  async function generate(){
    const validDocs=docs.filter(d=>!d.error);
    if(!transcript.trim()&&validDocs.length===0)return;
    setErrMsg("");setScreen("loading");
    let resolvedClientId=inputClientId;
    if(inputClientId==="__new__"&&newClientNameInput.trim()){
      const{data}=await supabase.from("clients").insert({name:newClientNameInput.trim(),user_id:user.id}).select().single();
      if(data){setClients(prev=>[...prev,data].sort((a,b)=>a.name.localeCompare(b.name)));resolvedClientId=data.id;}
      else resolvedClientId=null;
    }else if(inputClientId==="__new__"){resolvedClientId=null;}
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
      const newProject={id:crypto.randomUUID(),user_id:user.id,title:parsed.projectTitle||"Untitled",client_name:parsed.clientName||"",status:"Draft",brief:parsed,doc_count:validDocs.length,client_id:resolvedClientId||null,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
      const saved=await saveProject(newProject);
      setActiveProject(saved||newProject);
      setPage("overview");setShareMode(false);setChatLog([]);setChatOpen(false);setDocs([]);setTranscript("");setInputClientId(null);setNewClientNameInput("");setScreen("doc");
    }catch(err){console.error(err);setErrMsg(err.message||"Something went wrong.");setScreen("input");}
  }

  async function sendChat(msg){
    if(!brief)return;
    const updatedLog=[...chatLog,{role:"user",content:msg}];
    setChatLog(updatedLog);setChatBusy(true);
    try{
      const conceptList=arr(brief.concepts).map((c,i)=>`#${i+1}: "${c.title}" (id: ${c.id})`).join(", ");
      const system=`You are a creative director AI actively editing a production brief. Full conversation history is maintained.

Concepts in this brief: ${conceptList||"none yet"}

RESPONSE FORMAT — return ONLY a valid JSON object, no markdown, no extra text:
{"message":"Your 1-2 sentence reply","briefUpdate":null}
When making edits:
{"message":"Done! I updated X.","briefUpdate":{"fieldName":"newValue"}}

EDITING RULES:
- briefUpdate contains ONLY changed fields (partial update, not the whole brief)
- For concept changes: include only the changed concept(s) in a "concepts" array with their full updated data
- Unchanged concepts must NOT appear in briefUpdate.concepts
- If the user's intent is ambiguous (unclear which concept): ask in message and set briefUpdate to null
- You can ALWAYS edit the document — never say you can't
- Bulk ops (e.g. "rewrite all director's notes"): include all concepts in briefUpdate.concepts
- Keep message brief (1-2 sentences)
- For hooks: update concept.hooks array and optionally concept.selectedHook

REQUIRED FIELD SCHEMAS — use exactly these field names:
- concept.locations items: {"name":"","vibe":"","address":"","description":"","shots":""}
- overallLocations items: {"name":"","address":"","description":""}
- shotList items: {"number":"01","type":"","description":"","lens":"","notes":""}
- clientActionItems / internalTodos items: {"id":"ca-1","text":"","done":false}
- wardrobe / props / moodKeywords / references: plain strings in an array

Current brief:
${JSON.stringify(brief)}`;
      // Filter out role:"system" messages — Anthropic only accepts "user" and "assistant"
      const apiMessages=updatedLog.filter(m=>m.role==="user"||m.role==="assistant");
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","anthropic-dangerous-direct-browser-access":"true","x-api-key":API_KEY,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:MODEL,max_tokens:8000,system,messages:apiMessages})});
      const data=await res.json();
      const text=(data.content||[]).map(b=>b.text||"").join("").trim();
      let parsed=null;
      try{const s=text.indexOf("{"),e=text.lastIndexOf("}");if(s!==-1&&e!==-1)parsed=JSON.parse(text.slice(s,e+1));}
      catch(pe){console.error("Chat parse error:",pe);}
      const reply=parsed?.message||text;
      const update=parsed?.briefUpdate;
      if(update&&typeof update==="object"){
        setAiEditing(true);
        setBrief(prev=>{
          const merged={...prev,...update};
          if(update.concepts&&Array.isArray(update.concepts)&&Array.isArray(prev.concepts)){
            const byId={};update.concepts.forEach(c=>{if(c.id)byId[c.id]=c;});
            merged.concepts=prev.concepts.map(c=>byId[c.id]?{...c,...byId[c.id]}:c);
            update.concepts.forEach(c=>{if(c.id&&!prev.concepts.find(p=>p.id===c.id))merged.concepts.push(c);});
          }
          return merged;
        });
        setTimeout(()=>setAiEditing(false),1500);
        setChatLog(prev=>[...prev,{role:"assistant",content:reply},{role:"system",content:"✓ Brief updated"}]);
      }else{
        setChatLog(prev=>[...prev,{role:"assistant",content:reply}]);
      }
    }catch(err){console.error("sendChat error:",err);setChatLog(prev=>[...prev,{role:"assistant",content:"Something went wrong — try again."}]);}
    finally{setChatBusy(false);}
  }

  function addConcept(){
    const blank={id:`c-${Date.now()}`,emoji:"🎬",title:"New Concept",type:"",logline:"",description:"",moodKeywords:[],inspiration:[],locations:[],lighting:{style:"",description:"",technical:""},colorHex:["#f5f0e8","#d4c5a9","#8b7355"],colorDescription:"",wardrobe:[],wardrobeNotes:"",props:[],shotList:[],script:{hook:"",act1:"",act2:"",act3:"",cta:""},deliverableFormat:"",directorNotes:"",hooks:[],selectedHook:""};
    const idx=arr(brief?.concepts).length;
    setBrief(b=>({...b,concepts:[...(b.concepts||[]),blank]}));
    setPage(`concept-${idx}`);setSidebarOpen(false);
  }

  const conceptIdx=page.startsWith("concept-")?parseInt(page.replace("concept-","")):-1;
  const canGenerate=transcript.trim()||docs.filter(d=>!d.error).length>0;

  function SidebarContent(){
    const meetingHistory=arr(activeProject?.meeting_history);
    return(<>
      <button onClick={()=>setSidebarOpen(false)} style={{display:"flex",alignItems:"center",gap:6,width:"100%",padding:"10px 14px",border:"none",background:"none",cursor:"pointer",fontSize:13,color:"#9b9a97",fontFamily:"'Lora',serif",borderBottom:"1px solid #f1f0ef",marginBottom:8}}>← Close Menu</button>
      <div style={{fontSize:10,fontFamily:"'IBM Plex Mono',monospace",color:"#c4c3bf",textTransform:"uppercase",letterSpacing:"0.1em",padding:"0 10px",marginBottom:4}}>Project</div>
      <button className={`nb ${page==="overview"?"on":""}`} onClick={()=>{setPage("overview");setSidebarOpen(false);}}><span style={{fontSize:15,flexShrink:0}}>📁</span><span>Overview</span></button>
      <div style={{fontSize:10,fontFamily:"'IBM Plex Mono',monospace",color:"#c4c3bf",textTransform:"uppercase",letterSpacing:"0.1em",padding:"14px 10px 4px"}}>Concepts</div>
      {arr(brief?.concepts).map((c,i)=>(<button key={i} className={`nb ${page===`concept-${i}`?"on":""}`} onClick={()=>{setPage(`concept-${i}`);setSidebarOpen(false);}}><span style={{fontSize:15,flexShrink:0}}>{c.emoji||"🎬"}</span><span style={{overflow:"hidden",textOverflow:"ellipsis"}}>{c.title||`Concept ${i+1}`}</span></button>))}
      <button onClick={addConcept} style={{display:"flex",alignItems:"center",gap:6,width:"100%",padding:"6px 10px",border:"none",background:"none",cursor:"pointer",fontSize:12,color:"#9b9a97",fontFamily:"'Lora',serif",marginTop:6,borderRadius:6}} onMouseEnter={e=>e.currentTarget.style.color="#37352f"} onMouseLeave={e=>e.currentTarget.style.color="#9b9a97"}>+ Add Concept</button>
      <div style={{fontSize:10,fontFamily:"'IBM Plex Mono',monospace",color:"#c4c3bf",textTransform:"uppercase",letterSpacing:"0.1em",padding:"14px 10px 4px"}}>Production</div>
      <button className={`nb ${page==="shootday"?"on":""}`} onClick={()=>{setPage("shootday");setSidebarOpen(false);}}><span style={{fontSize:15,flexShrink:0}}>🎬</span><span>Shoot Day</span></button>
      <button className={`nb ${page==="postprod"?"on":""}`} onClick={()=>{setPage("postprod");setSidebarOpen(false);}}><span style={{fontSize:15,flexShrink:0}}>✂️</span><span>Post Production</span></button>
      {meetingHistory.length>0&&(<>
        <div style={{fontSize:10,fontFamily:"'IBM Plex Mono',monospace",color:"#c4c3bf",textTransform:"uppercase",letterSpacing:"0.1em",padding:"14px 10px 4px"}}>Meetings</div>
        {meetingHistory.map((m,i)=>{
          // Label: Discovery, Consultation, Consultation #2, etc.
          const stageLabel=(m.stage||"discovery").replace("_"," ");
          const sameStageIdx=meetingHistory.slice(0,i).filter(x=>x.stage===m.stage).length;
          const label=sameStageIdx===0?stageLabel.replace(/^\w/,c=>c.toUpperCase()):stageLabel.replace(/^\w/,c=>c.toUpperCase())+` #${sameStageIdx+1}`;
          const isActive=viewingMeetingIdx===i;
          return(
            <button key={m.id||i} className={`nb ${isActive?"on":""}`} onClick={()=>{setViewingMeeting(m);setViewingMeetingIdx(i);setMeetingNotesExpanded(window.innerWidth<=768);setSidebarOpen(false);}}>
              <span style={{fontSize:13,flexShrink:0}}>🗒</span>
              <span style={{overflow:"hidden",textOverflow:"ellipsis",display:"flex",alignItems:"center",gap:6}}>
                {label}
                {m.status==="pending_review"&&<span style={{width:6,height:6,borderRadius:"50%",background:"#e97942",flexShrink:0,display:"inline-block"}}/>}
              </span>
            </button>
          );
        })}
      </>)}
      {myRole!=="viewer"&&<button onClick={()=>{setShowConsultationModal(true);setSidebarOpen(false);}} style={{display:"flex",alignItems:"center",gap:6,width:"100%",padding:"6px 10px",border:"none",background:"none",cursor:"pointer",fontSize:12,color:"#1a56c4",fontFamily:"'Lora',serif",marginTop:6,borderRadius:6,fontWeight:600}} onMouseEnter={e=>e.currentTarget.style.background="#e8f0fe"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>📞 Join Call</button>}
      {myRole!=="viewer"&&<button onClick={()=>{setShowScheduleConsultation(true);setSidebarOpen(false);}} style={{display:"flex",alignItems:"center",gap:6,width:"100%",padding:"6px 10px",border:"none",background:"none",cursor:"pointer",fontSize:12,color:"#e97942",fontFamily:"'Lora',serif",marginTop:2,borderRadius:6,fontWeight:600}} onMouseEnter={e=>e.currentTarget.style.background="#fdeee4"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>📅 Schedule Consultation</button>}
      <button onClick={()=>{setShowAddMeeting(true);setSidebarOpen(false);}} style={{display:"flex",alignItems:"center",gap:6,width:"100%",padding:"6px 10px",border:"none",background:"none",cursor:"pointer",fontSize:12,color:"#9b9a97",fontFamily:"'Lora',serif",marginTop:2,borderRadius:6}} onMouseEnter={e=>e.currentTarget.style.color="#37352f"} onMouseLeave={e=>e.currentTarget.style.color="#9b9a97"}>+ Add Meeting Notes</button>
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

  if(sharedIdeaLoading)return(<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}><style>{CSS}</style><div className="spin" style={{width:28,height:28,border:"2px solid #f1f0ef",borderTop:"2px solid #37352f",borderRadius:"50%"}}/></div>);
  if(screen==="sharedIdea")return(<div><style>{CSS}</style><SharedIdeaView idea={sharedIdeaData}/></div>);
  if(authLoading&&!activeProject)return(<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}><style>{CSS}</style><div className="spin" style={{width:28,height:28,border:"2px solid #f1f0ef",borderTop:"2px solid #37352f",borderRadius:"50%"}}/></div>);
  if(!user&&!shareProjectId)return(<div><style>{CSS}</style><AuthScreen/></div>);
  if(!user&&shareProjectId&&screen!=="doc")return(<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}><style>{CSS}</style><div className="spin" style={{width:28,height:28,border:"2px solid #f1f0ef",borderTop:"2px solid #37352f",borderRadius:"50%"}}/></div>);

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
          <button className={`nb ${page==="postprod"?"on":""}`} onClick={()=>setPage("postprod")} style={{marginTop:8}}><span style={{fontSize:15}}>✂️</span><span>Post Production</span></button>
        </div>
        <div style={{flex:1,overflowY:"auto"}}>
          {page==="overview"&&<OverviewPage brief={brief} setBrief={()=>{}} goTo={setPage} readonly meetingStage={activeProject?.meeting_stage||"discovery"}/>}
          {conceptIdx>=0&&brief?.concepts?.[conceptIdx]&&<ConceptPage key={conceptIdx} concept={brief.concepts[conceptIdx]} onChange={()=>{}} readonly/>}
          {page==="postprod"&&<PostProductionPanel postProduction={activeProject?.post_production||{}} onUpdate={pp=>{setActiveProject(prev=>({...prev,post_production:pp}));supabase.from("projects").update({post_production:pp,updated_at:new Date().toISOString()}).eq("id",activeProject.id);}} readonly projectId={activeProject?.id} meetingHistory={arr(activeProject?.meeting_history)} fullTranscript={activeProject?.recall_transcript||""} concepts={arr(activeProject?.brief?.concepts)}/>}
        </div>
      </div>
    </div>
  );

  if(screen==="ideas")return(<div><style>{CSS}</style><IdeaCapture user={user} onBack={()=>setScreen("dashboard")} projects={projects} onOpenProject={p=>{setMyRole("owner");setActiveProject(p);setPage("overview");setShareMode(false);setChatLog([]);setChatOpen(false);setSidebarOpen(false);setViewingMeeting(null);setViewingMeetingIdx(null);setMeetingNotesExpanded(false);setScreen("doc");}}/></div>);
  if(screen==="meetings")return(<div><style>{CSS}</style><MeetingsScreen user={user} projects={projects} onBack={()=>setScreen("dashboard")}/></div>);

  if(screen==="clients")return(<div><style>{CSS}</style><ClientList clients={clients} projects={projects} user={user} onBack={()=>setScreen("dashboard")} onNew={c=>setClients(prev=>[...prev,c].sort((a,b)=>a.name.localeCompare(b.name)))} onOpen={c=>{setActiveClientId(c.id);setScreen("clientProfile");}}/></div>);

  if(screen==="clientProfile")return(<div><style>{CSS}</style><ClientProfile clientId={activeClientId} clients={clients} setClients={setClients} projects={projects} onBack={()=>setScreen("clients")} onOpenProject={p=>{setMyRole("owner");setActiveProject(p);setPage("overview");setShareMode(false);setChatLog([]);setChatOpen(false);setSidebarOpen(false);setViewingMeeting(null);setViewingMeetingIdx(null);setMeetingNotesExpanded(false);setScreen("doc");}} onNewProject={()=>{setInputClientId(activeClientId);setNewClientNameInput("");setTranscript("");setDocs([]);setErrMsg("");setScreen("input");}} onLinkProject={(projectId,clientId)=>setProjects(ps=>ps.map(p=>p.id===projectId?{...p,client_id:clientId}:p))}/></div>);

  if(screen==="dashboard")return(<div><style>{CSS}</style><Dashboard projects={projects} sharedProjects={sharedProjects} user={user} onOpen={p=>{const role=p._sharedRole||(p.user_id===user?.id?"owner":"owner");setMyRole(p._sharedRole?p._sharedRole:role);setActiveProject(p);setPage("overview");setShareMode(p._sharedRole==="viewer");setChatLog([]);setChatOpen(false);setSidebarOpen(false);setViewingMeeting(null);setViewingMeetingIdx(null);setMeetingNotesExpanded(false);setScreen("doc");}} onNew={()=>{setTranscript("");setDocs([]);setErrMsg("");setInputClientId(null);setNewClientNameInput("");setScreen("input");}} onDelete={deleteProject} onStatusChange={updateStatus} onSignOut={()=>supabase.auth.signOut()} onIdeas={()=>setScreen("ideas")} onClients={()=>setScreen("clients")} onMeetings={()=>setScreen("meetings")}/></div>);

  if(screen==="input")return(
    <div style={{minHeight:"100vh",background:"#fff"}}><style>{CSS}</style>
      <div style={{maxWidth:660,margin:"0 auto",padding:"36px 20px 80px"}}>
        <button onClick={()=>setScreen("dashboard")} style={{background:"none",border:"none",color:"#9b9a97",fontSize:13,cursor:"pointer",fontFamily:"'Lora',serif",marginBottom:36,display:"flex",alignItems:"center",gap:6}}>← All Projects</button>
        <div style={{textAlign:"center",marginBottom:36}}><div style={{fontSize:44,marginBottom:10}}>🎬</div><h1 style={{fontSize:32,fontWeight:700,color:"#37352f",letterSpacing:"-0.02em",marginBottom:10}}>New Brief</h1><p style={{color:"#9b9a97",fontSize:14,fontStyle:"italic",lineHeight:1.6}}>Paste your meeting notes or send a bot to your live meeting.</p></div>
        <MeetingBotPanel projectId={null} onBotStarted={async (botId)=>{
          // Create project with bot ID already included
          const projectId = crypto.randomUUID();
          const newProject={id:projectId,user_id:user.id,title:"Meeting in progress…",client_name:"",status:"Draft",brief:{projectTitle:"Meeting in progress…",concepts:[],clientActionItems:[],internalTodos:[]},doc_count:0,client_id:(inputClientId&&inputClientId!=="__new__"?inputClientId:null),recall_bot_id:botId,recall_status:"bot_joined",created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
          // Save to Supabase directly with upsert to ensure bot ID is stored
          const{data}=await supabase.from("projects").insert({
            id:projectId,user_id:user.id,title:"Meeting in progress…",client_name:"",
            status:"Draft",brief:{projectTitle:"Meeting in progress…",concepts:[],clientActionItems:[],internalTodos:[]},
            doc_count:0,client_id:(inputClientId&&inputClientId!=="__new__"?inputClientId:null),recall_bot_id:botId,recall_status:"bot_joined",
            created_at:new Date().toISOString(),updated_at:new Date().toISOString()
          }).select().single();
          const project = data || newProject;
          setProjects(ps=>[project,...ps]);
          setActiveProject(project);
          setPage("overview");
          setScreen("doc");
        }} recallStatus={null}/>
        <div style={{display:"flex",alignItems:"center",gap:12,margin:"20px 0"}}><div style={{flex:1,height:1,background:"#f1f0ef"}}/><span style={{fontSize:12,color:"#c4c3bf"}}>or paste notes manually</span><div style={{flex:1,height:1,background:"#f1f0ef"}}/></div>
        {clients.length>0&&(
          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:"#9b9a97",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:8}}>Link to Client (Optional)</div>
            <select value={inputClientId||""} onChange={e=>setInputClientId(e.target.value||null)} style={{width:"100%",border:"1px solid #e8e4dc",borderRadius:8,padding:"10px 14px",fontFamily:"'Lora',serif",fontSize:13,color:"#37352f",background:"#fafaf9",outline:"none",cursor:"pointer"}}>
              <option value="">No client</option>
              {clients.map(c=><option key={c.id} value={c.id}>{c.name}{c.company?` (${c.company})`:""}</option>)}
              <option value="__new__">+ Create new client…</option>
            </select>
            {inputClientId==="__new__"&&(
              <input value={newClientNameInput} onChange={e=>setNewClientNameInput(e.target.value)} placeholder="New client name" style={{width:"100%",marginTop:8,border:"1px solid #e8e4dc",borderRadius:8,padding:"10px 14px",fontFamily:"'Lora',serif",fontSize:13,color:"#37352f",outline:"none",boxSizing:"border-box",background:"#fafaf9"}} onFocus={e=>e.target.style.borderColor="#37352f"} onBlur={e=>e.target.style.borderColor="#e8e4dc"}/>
            )}
          </div>
        )}
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
          {aiEditing&&<span style={{fontSize:11,color:"#e97942",fontStyle:"italic",flexShrink:0,animation:"pulse 1s ease-in-out infinite"}}>✦ AI editing…</span>}
          {!aiEditing&&dbSaving&&<span style={{fontSize:11,color:"#c4c3bf",fontStyle:"italic",flexShrink:0}}>Saving…</span>}
        </div>
        <div style={{display:"flex",gap:6,flexShrink:0,alignItems:"center",position:"relative"}}>
          {/* Desktop buttons */}
          {myRole==="owner"&&<button className="tbtn hide-on-mobile" onClick={()=>setShowShareModal(true)}>🔗 Share{activeProject?.share_enabled&&<span style={{marginLeft:4,width:6,height:6,borderRadius:"50%",background:"#e97942",display:"inline-block",verticalAlign:"middle"}}/>}</button>}
          <button className="tbtn hide-on-mobile" onClick={()=>setShareMode(true)}>👁 Client</button>
          {(myRole==="owner"||myRole==="editor")&&<button className={`tbtn hide-on-mobile ${chatOpen?"on":""}`} onClick={()=>setChatOpen(o=>!o)}>{chatOpen?"✕ AI":"✦ AI"}</button>}
          {/* Mobile: ⋯ more menu containing Share, Client, AI */}
          <div className="mobile-only" style={{position:"relative"}}>
            <button onClick={()=>setMoreMenuOpen(o=>!o)} style={{background:moreMenuOpen?"#37352f":"none",color:moreMenuOpen?"#fff":"#37352f",border:"1px solid #e8e4dc",borderRadius:6,padding:"6px 11px",fontSize:14,cursor:"pointer",fontFamily:"'Lora',serif",lineHeight:1}}>⋯</button>
            {moreMenuOpen&&(
              <>
                <div style={{position:"fixed",inset:0,zIndex:149}} onClick={()=>setMoreMenuOpen(false)}/>
                <div style={{position:"absolute",right:0,top:"calc(100% + 6px)",background:"#fff",border:"1px solid #e8e4dc",borderRadius:10,boxShadow:"0 8px 24px rgba(0,0,0,0.12)",zIndex:150,minWidth:180,overflow:"hidden"}}>
                  {myRole==="owner"&&<button onClick={()=>{setMoreMenuOpen(false);setShowShareModal(true);}} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"13px 16px",border:"none",background:"none",cursor:"pointer",fontSize:14,color:"#37352f",fontFamily:"'Lora',serif",textAlign:"left"}}>
                    🔗 <span>Share{activeProject?.share_enabled&&<span style={{marginLeft:6,width:6,height:6,borderRadius:"50%",background:"#e97942",display:"inline-block",verticalAlign:"middle"}}/>}</span>
                  </button>}
                  <button onClick={()=>{setMoreMenuOpen(false);setShareMode(true);}} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"13px 16px",border:"none",borderTop:myRole==="owner"?"1px solid #f1f0ef":"none",background:"none",cursor:"pointer",fontSize:14,color:"#37352f",fontFamily:"'Lora',serif",textAlign:"left"}}>
                    👁 <span>Client View</span>
                  </button>
                  {(myRole==="owner"||myRole==="editor")&&<button onClick={()=>{setMoreMenuOpen(false);setChatOpen(o=>!o);}} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"13px 16px",border:"none",borderTop:"1px solid #f1f0ef",background:chatOpen?"#f0f4ff":"none",cursor:"pointer",fontSize:14,color:chatOpen?"#1a56c4":"#37352f",fontFamily:"'Lora',serif",textAlign:"left"}}>
                    ✦ <span>{chatOpen?"Close AI":"AI Assistant"}</span>
                  </button>}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      {myRole!=="owner"&&<div style={{background:myRole==="editor"?"#fef3e2":"#e8f0fe",borderBottom:"1px solid",borderBottomColor:myRole==="editor"?"#fde8c8":"#d2e3fc",padding:"7px 20px",fontSize:12,color:myRole==="editor"?"#92400e":"#1a56c4",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
        <span>{myRole==="editor"?"✏️ You have editor access to this project":"👁 You have view-only access to this project"}</span>
        {!user&&<button onClick={()=>{window.location.href=`/?redirect=/share/${activeProject?.id}`;}} style={{background:"none",border:"1px solid currentColor",borderRadius:4,padding:"3px 10px",fontSize:11,cursor:"pointer",fontFamily:"'Lora',serif",color:"inherit"}}>Log in to collaborate →</button>}
      </div>}
      {pendingMeeting&&myRole!=="viewer"&&(
        <div style={{background:"#fdeee4",borderBottom:"1px solid #f5c9a8",padding:"10px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,gap:12}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:14}}>📋</span>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:"#37352f"}}>New meeting ready for review</div>
              <div style={{fontSize:12,color:"#9b9a97"}}>{pendingMeeting.stage?.replace("_"," ")} · {pendingMeeting.suggestedChanges?.length||0} suggested changes</div>
            </div>
          </div>
          <div style={{display:"flex",gap:8,flexShrink:0}}>
            <button onClick={()=>dismissMeeting(pendingMeeting)} style={{background:"none",border:"1px solid #f1f0ef",borderRadius:6,padding:"5px 12px",fontSize:12,color:"#9b9a97",cursor:"pointer",fontFamily:"'Lora',serif"}}>Dismiss</button>
            <button onClick={()=>setReviewingMeeting(pendingMeeting)} style={{background:"#e97942",color:"#fff",border:"none",borderRadius:6,padding:"5px 14px",fontSize:12,cursor:"pointer",fontFamily:"'Lora',serif",fontWeight:600}}>Review Changes →</button>
          </div>
        </div>
      )}
      {showShareModal&&user&&<ShareModal project={activeProject} user={user} onClose={()=>setShowShareModal(false)} onProjectUpdate={p=>{setActiveProject(prev=>({...prev,...p}));setProjects(ps=>ps.map(pp=>pp.id===p.id?{...pp,...p}:pp));}}/>}
      {showConsultationModal&&user&&activeProject&&<JoinCallModal user={user} project={activeProject} projects={projects} onClose={()=>setShowConsultationModal(false)} onScheduled={(stage)=>{const updated={...activeProject,meeting_stage:stage};setActiveProject(updated);setProjects(ps=>ps.map(p=>p.id===updated.id?updated:p));}}/>}
      {showScheduleConsultation&&user&&activeProject&&<ScheduleConsultationModal user={user} project={activeProject} onClose={()=>setShowScheduleConsultation(false)} onScheduled={(stage)=>{const updated={...activeProject,meeting_stage:stage};setActiveProject(updated);setProjects(ps=>ps.map(p=>p.id===updated.id?updated:p));}}/>}
      {reviewingMeeting&&myRole!=="viewer"&&<SuggestedChangesModal meeting={reviewingMeeting} currentBrief={brief} onApply={(indices)=>{applyMeetingChanges(reviewingMeeting,indices);setReviewingMeeting(null);}} onDismiss={()=>{dismissMeeting(reviewingMeeting);setReviewingMeeting(null);}}/>}
      {showJoinCall&&(
        <div style={{position:"fixed",inset:0,zIndex:400,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>{setShowJoinCall(false);setJoinCallUrl("");setJoinCallError("");}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:12,padding:"28px 28px 24px",width:"min(480px,100%)",boxShadow:"0 8px 32px rgba(0,0,0,0.15)"}}>
            {joinCallLoading?(
              <div style={{textAlign:"center",padding:"20px 0"}}>
                <div className="spin" style={{width:28,height:28,border:"3px solid #e8e4dc",borderTop:"3px solid #1a56c4",borderRadius:"50%",margin:"0 auto 14px"}}/>
                <div style={{fontWeight:700,fontSize:15,color:"#37352f",marginBottom:6}}>Bot is joining…</div>
                <div style={{fontSize:13,color:"#9b9a97"}}>Frame Brief will automatically generate your brief when the call ends.</div>
              </div>
            ):(
              <>
                <div style={{fontSize:18,fontWeight:700,color:"#37352f",marginBottom:6}}>📞 Join This Call</div>
                <div style={{fontSize:13,color:"#9b9a97",marginBottom:20,lineHeight:1.6}}>Paste a Google Meet, Zoom, or Teams link. The bot will join, record, and auto-generate meeting notes tied to this project.</div>
                <input
                  autoFocus
                  value={joinCallUrl}
                  onChange={e=>{setJoinCallUrl(e.target.value);setJoinCallError("");}}
                  onKeyDown={e=>e.key==="Enter"&&handleJoinCall()}
                  placeholder="https://meet.google.com/abc-defg-hij"
                  style={{width:"100%",border:`1px solid ${joinCallError?"#ffc9c9":"#e8e4dc"}`,borderRadius:8,padding:"12px 14px",fontFamily:"'Lora',serif",fontSize:13,color:"#37352f",outline:"none",marginBottom:joinCallError?8:16,boxSizing:"border-box"}}
                  onFocus={e=>e.target.style.borderColor="#37352f"} onBlur={e=>e.target.style.borderColor=joinCallError?"#ffc9c9":"#e8e4dc"}
                />
                {joinCallError&&<div style={{fontSize:12,color:"#c0392b",marginBottom:12}}>{joinCallError}</div>}
                <div style={{display:"flex",gap:10}}>
                  <button onClick={handleJoinCall} disabled={!joinCallUrl.trim()} style={{background:"#1a56c4",color:"#fff",border:"none",padding:"10px 20px",borderRadius:6,fontFamily:"'Lora',serif",fontSize:13,cursor:joinCallUrl.trim()?"pointer":"not-allowed",opacity:joinCallUrl.trim()?1:0.5}}>Send Bot</button>
                  <button onClick={()=>{setShowJoinCall(false);setJoinCallUrl("");setJoinCallError("");}} style={{background:"transparent",border:"1px solid #e8e4dc",padding:"10px 16px",borderRadius:6,fontFamily:"'Lora',serif",fontSize:13,cursor:"pointer",color:"#9b9a97"}}>Cancel</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {showAddMeeting&&(
        <div style={{position:"fixed",inset:0,zIndex:400,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setShowAddMeeting(false)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:12,padding:"28px 28px 24px",width:"min(560px,100%)",boxShadow:"0 8px 32px rgba(0,0,0,0.15)"}}>
            <div style={{fontSize:18,fontWeight:700,color:"#37352f",marginBottom:6}}>Add Meeting Notes</div>
            <div style={{fontSize:13,color:"#9b9a97",marginBottom:16,lineHeight:1.6}}>Paste transcript or notes from your meeting. AI will detect the stage, summarize, and suggest changes.</div>
            <textarea value={addMeetingTranscript} onChange={e=>{setAddMeetingTranscript(e.target.value);setAddMeetingError("");}} rows={8} placeholder="Paste meeting transcript or notes here…" style={{width:"100%",border:"1px solid #e8e4dc",borderRadius:8,padding:"12px 14px",fontFamily:"'Lora',serif",fontSize:13,color:"#37352f",outline:"none",resize:"vertical",boxSizing:"border-box",marginBottom:12}} onFocus={e=>e.target.style.borderColor="#37352f"} onBlur={e=>e.target.style.borderColor="#e8e4dc"}/>
            {addMeetingError&&<div style={{background:"#fff3f0",border:"1px solid #fca5a5",borderRadius:6,padding:"8px 12px",fontSize:12,color:"#b91c1c",marginBottom:12}}>{addMeetingError}</div>}
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>processManualMeeting(addMeetingTranscript)} disabled={!addMeetingTranscript.trim()||addMeetingLoading} style={{background:"#37352f",color:"#fff",border:"none",padding:"10px 20px",borderRadius:6,fontFamily:"'Lora',serif",fontSize:13,cursor:addMeetingTranscript.trim()&&!addMeetingLoading?"pointer":"not-allowed",opacity:addMeetingTranscript.trim()&&!addMeetingLoading?1:0.5,display:"flex",alignItems:"center",gap:8}}>
                {addMeetingLoading&&<div className="spin" style={{width:13,height:13,border:"2px solid rgba(255,255,255,0.3)",borderTop:"2px solid #fff",borderRadius:"50%"}}/>}
                {addMeetingLoading?"Processing…":"✦ Process Meeting"}
              </button>
              <button onClick={()=>setShowAddMeeting(false)} style={{background:"transparent",border:"1px solid #e8e4dc",padding:"10px 16px",borderRadius:6,fontFamily:"'Lora',serif",fontSize:13,cursor:"pointer",color:"#9b9a97"}}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      <div style={{display:"flex",flex:1,overflow:"hidden"}}>
        {sidebarOpen&&<div style={{width:220,borderRight:"1px solid #f1f0ef",padding:"16px 10px",overflowY:"auto",background:"#fafaf9",flexShrink:0,display:"flex",flexDirection:"column"}}>{SidebarContent()}</div>}
        <div style={{flex:1,overflowY:"auto"}}>
          {page==="overview"&&<OverviewPage brief={brief} setBrief={setBrief} goTo={p=>{setPage(p);setSidebarOpen(false);}} recallStatus={activeProject?.recall_status} recallBotId={activeProject?.recall_bot_id} projectId={activeProject?.id} onTranscriptReady={()=>{loadProjects().then(()=>{const p=projects.find(x=>x.id===activeProject?.id);if(p)setActiveProject(p);});}} onGenerateBrief={generateBriefFromSavedTranscript} briefGenError={briefGenError} clientId={activeProject?.client_id} onClientClick={()=>{setActiveClientId(activeProject.client_id);setScreen("clientProfile");}} clients={clients} onClientLink={linkClientToProject} onClientUnlink={unlinkClientFromProject} onClientCreateAndLink={createAndLinkClient} meetingStage={activeProject?.meeting_stage||"discovery"} onStageChange={stage=>{setActiveProject(prev=>{const updated={...prev,meeting_stage:stage};clearTimeout(window._briefSaveTimer);window._briefSaveTimer=setTimeout(()=>saveProject(updated),1500);return updated;});setProjects(ps=>ps.map(p=>p.id===activeProject?.id?{...p,meeting_stage:stage}:p));}}/>}
          {conceptIdx>=0&&brief.concepts?.[conceptIdx]&&<ConceptPage key={conceptIdx} concept={brief.concepts[conceptIdx]} onChange={val=>setBrief(b=>{const c=[...(b.concepts||[])];c[conceptIdx]=val;return{...b,concepts:c};})}/>}
          {page==="shootday"&&<CallSheetPanel brief={brief} callSheet={activeProject?.call_sheet||{}} onUpdate={cs=>{setActiveProject(prev=>{const updated={...prev,call_sheet:cs};clearTimeout(window._briefSaveTimer);window._briefSaveTimer=setTimeout(()=>saveProject(updated),1500);return updated;});}} readonly={myRole==="viewer"}/>}
          {page==="postprod"&&<PostProductionPanel postProduction={activeProject?.post_production||{}} onUpdate={pp=>{setActiveProject(prev=>{const updated={...prev,post_production:pp};clearTimeout(window._briefSaveTimer);window._briefSaveTimer=setTimeout(()=>saveProject(updated),1500);return updated;});}} readonly={myRole==="viewer"} projectId={activeProject?.id} meetingHistory={arr(activeProject?.meeting_history)} fullTranscript={activeProject?.recall_transcript||""} concepts={arr(activeProject?.brief?.concepts)}/>}
        </div>
        {/* Meeting Notes right panel — sits alongside the brief like the chat panel */}
        {viewingMeeting&&!meetingNotesExpanded&&(()=>{
          const history=arr(activeProject?.meeting_history);
          const idx=viewingMeetingIdx??0;
          const stageLabel=(viewingMeeting.stage||"discovery").replace("_"," ");
          const sameStageIdx=history.slice(0,idx).filter(x=>x.stage===viewingMeeting.stage).length;
          const label=sameStageIdx===0?stageLabel.replace(/^\w/,c=>c.toUpperCase()):stageLabel.replace(/^\w/,c=>c.toUpperCase())+` #${sameStageIdx+1}`;
          return <MeetingNotesPanel meeting={viewingMeeting} fullTranscript={activeProject?.recall_transcript||""} label={label} expanded={false} onToggleExpand={()=>setMeetingNotesExpanded(true)} onClose={()=>{setViewingMeeting(null);setViewingMeetingIdx(null);}} onApply={(indices)=>{applyMeetingChanges(viewingMeeting,indices);setViewingMeeting(m=>m?{...m,status:"reviewed"}:m);}} onDismiss={()=>{dismissMeeting(viewingMeeting);setViewingMeeting(null);setViewingMeetingIdx(null);}} onRegenerate={updated=>{setViewingMeeting(updated);const newHist=arr(activeProject?.meeting_history).map(m=>m.id===updated.id?updated:m);setActiveProject(p=>({...p,meeting_history:newHist,recall_status:"brief_pending_review"}));setProjects(ps=>ps.map(p=>p.id===activeProject?.id?{...p,meeting_history:newHist}:p));}} projectId={activeProject?.id} projects={projects} onMove={moveMeetingToProject}/>;
        })()}
        {chatOpen&&<div style={{width:340,borderLeft:"1px solid #f1f0ef",display:"flex",flexDirection:"column",flexShrink:0,overflow:"hidden"}} className="hide-on-mobile"><AIChatPanel chatLog={chatLog} onSend={sendChat} busy={chatBusy} onClose={()=>setChatOpen(false)}/></div>}
      </div>
      {/* Meeting Notes full-screen expand */}
      {viewingMeeting&&meetingNotesExpanded&&(()=>{
        const history=arr(activeProject?.meeting_history);
        const idx=viewingMeetingIdx??0;
        const stageLabel=(viewingMeeting.stage||"discovery").replace("_"," ");
        const sameStageIdx=history.slice(0,idx).filter(x=>x.stage===viewingMeeting.stage).length;
        const label=sameStageIdx===0?stageLabel.replace(/^\w/,c=>c.toUpperCase()):stageLabel.replace(/^\w/,c=>c.toUpperCase())+` #${sameStageIdx+1}`;
        return <MeetingNotesPanel meeting={viewingMeeting} fullTranscript={activeProject?.recall_transcript||""} label={label} expanded={true} onToggleExpand={()=>setMeetingNotesExpanded(false)} onClose={()=>{setViewingMeeting(null);setViewingMeetingIdx(null);setMeetingNotesExpanded(false);}} onApply={(indices)=>{applyMeetingChanges(viewingMeeting,indices);setViewingMeeting(m=>m?{...m,status:"reviewed"}:m);}} onDismiss={()=>{dismissMeeting(viewingMeeting);setViewingMeeting(null);setViewingMeetingIdx(null);setMeetingNotesExpanded(false);}} onRegenerate={updated=>{setViewingMeeting(updated);const newHist=arr(activeProject?.meeting_history).map(m=>m.id===updated.id?updated:m);setActiveProject(p=>({...p,meeting_history:newHist,recall_status:"brief_pending_review"}));setProjects(ps=>ps.map(p=>p.id===activeProject?.id?{...p,meeting_history:newHist}:p));}} projectId={activeProject?.id} projects={projects} onMove={moveMeetingToProject}/>;
      })()}
      {chatOpen&&<div className="mobile-only" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:250,flexDirection:"column",justifyContent:"flex-end"}}><div style={{background:"#fff",borderRadius:"16px 16px 0 0",height:"80vh",display:"flex",flexDirection:"column",overflow:"hidden"}}><div style={{padding:"12px 16px",borderBottom:"1px solid #f1f0ef",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}><span style={{fontWeight:700,fontSize:14}}>✦ AI Creative Director</span><button onClick={()=>setChatOpen(false)} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#9b9a97"}}>✕</button></div><div style={{flex:1,overflow:"hidden"}}><AIChatPanel chatLog={chatLog} onSend={sendChat} busy={chatBusy} onClose={()=>setChatOpen(false)} hideHeader/></div></div></div>}
    </div>
  );

  return null;
}

export default function FrameBrief() {
  return <ErrorBoundary><FrameBriefApp /></ErrorBoundary>;
}
