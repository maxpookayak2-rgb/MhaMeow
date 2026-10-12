// Supabase integration for Baan Oon Jai.
(() => {
  const cfg = window.BAAN_OON_JAI_SUPABASE || {};
  const configured = cfg.url && cfg.anonKey &&
    !cfg.url.includes("ใส่_") && !cfg.anonKey.includes("ใส่_");
  let client = null;
  let session = null;
  let signupMode = false;
  let activeConversation = null;
  let realtimeChannel = null;

  const say = message => typeof showToast === "function" ? showToast(message) : alert(message);
  const byId = id => document.getElementById(id);
  const setAuthMessage = message => { byId("authMessage").textContent = message || ""; };
  byId("authName").hidden = true;
  byId("authName").closest("label").hidden = true;

  if (!window.supabase || !configured) {
    byId("authOpenBtn").addEventListener("click", () => {
      byId("authModal").hidden = false;
      setAuthMessage("ต้องตั้งค่า supabase-config.js และสร้างฐานข้อมูลก่อน จึงจะสมัครสมาชิกหรือเข้าสู่ระบบได้");
    });
    byId("authForm").addEventListener("submit", event => {
      event.preventDefault();
      setAuthMessage("ยังไม่ได้เชื่อมต่อ Supabase กรุณาตั้งค่าตาม README-SUPABASE.md");
    });
    byId("switchAuthMode").addEventListener("click", () => {
      signupMode = !signupMode;
      byId("authName").hidden = !signupMode;
      byId("authName").closest("label").hidden = !signupMode;
      byId("authSubmit").textContent = signupMode ? "สมัครสมาชิก" : "เข้าสู่ระบบ";
      byId("switchAuthMode").textContent = signupMode ? "มีบัญชีแล้ว? เข้าสู่ระบบ" : "ยังไม่มีบัญชี? สมัครสมาชิก";
    });
    byId("closeAuth").addEventListener("click", () => byId("authModal").hidden = true);
    openChat = function() { say("แชทจริงต้องตั้งค่า Supabase ก่อน ดูขั้นตอนใน README-SUPABASE.md"); };
    byId("startAdoptionChat").addEventListener("click", event => { event.stopImmediatePropagation(); openChat(); }, true);
    document.querySelectorAll("#openPostTop,#openPostHero,#openPostBottom").forEach(button => {
      button.addEventListener("click", event => {
        event.stopImmediatePropagation();
        event.preventDefault();
        say("กรุณาตั้งค่า Supabase และเข้าสู่ระบบก่อนลงประกาศจริง");
      }, true);
    });
    return;
  }

  client = window.supabase.createClient(cfg.url, cfg.anonKey);
  window.baanOonJaiClient = client;
  const toAnimal = row => ({
    id: row.id, owner_id: row.owner_id, title: row.title, type: row.animal_type,
    province: row.province, description: row.description, age: row.age || "ยังไม่ได้ระบุ",
    sex: row.sex || "ยังไม่ได้ระบุ", health: row.health || "ยังไม่ได้ระบุ",
    lat: row.latitude ?? undefined, lng: row.longitude ?? undefined, status: row.status, image: row.image_url || ""
  });
  async function refreshListings() {
    const { data, error } = await client.from("listings").select("*").order("created_at", { ascending: false });
    if (error) { console.error(error); say("โหลดประกาศออนไลน์ไม่สำเร็จ ตรวจสอบตาราง listings และ RLS"); return; }
    animals = [...sampleAnimals.map(a => ({...a, demo: true})), ...(data || []).map(toAnimal)];
    render();
  }
  function updateAccountUI() {
    const signedIn = !!session?.user;
    byId("authOpenBtn").hidden = signedIn;
    byId("logoutBtn").hidden = !signedIn;
    byId("inboxBtn").hidden = !signedIn;
    byId("userLabel").hidden = !signedIn;
    byId("userLabel").textContent = signedIn ? (session.user.user_metadata?.display_name || session.user.email) : "";
  }
  function openAuth() {
    byId("authModal").hidden = false;
    setAuthMessage("");
    byId("authPassword").value = "";
  }
  byId("authOpenBtn").addEventListener("click", openAuth);
  byId("closeAuth").addEventListener("click", () => byId("authModal").hidden = true);
  byId("authModal").addEventListener("click", event => { if (event.target === byId("authModal")) byId("authModal").hidden = true; });
  byId("switchAuthMode").addEventListener("click", () => {
    signupMode = !signupMode;
    byId("authName").hidden = !signupMode;
    byId("authName").closest("label").hidden = !signupMode;
    byId("authSubmit").textContent = signupMode ? "สมัครสมาชิก" : "เข้าสู่ระบบ";
    byId("switchAuthMode").textContent = signupMode ? "มีบัญชีแล้ว? เข้าสู่ระบบ" : "ยังไม่มีบัญชี? สมัครสมาชิก";
    setAuthMessage("");
  });
  byId("authForm").addEventListener("submit", async event => {
    event.preventDefault();
    const email = byId("authEmail").value.trim();
    const password = byId("authPassword").value;
    const displayName = byId("authName").value.trim() || "สมาชิกบ้านอุ่นใจ";
    byId("authSubmit").disabled = true;
    setAuthMessage("กำลังดำเนินการ...");
    try {
      const result = signupMode
        ? await client.auth.signUp({ email, password, options: { data: { display_name: displayName } } })
        : await client.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (signupMode && !result.data.session) {
        setAuthMessage("สมัครสำเร็จ โปรดตรวจอีเมลเพื่อยืนยันบัญชี แล้วกลับมาเข้าสู่ระบบ");
      } else {
        session = result.data.session;
        updateAccountUI();
        byId("authModal").hidden = true;
        say(signupMode ? "สมัครสมาชิกสำเร็จ" : "เข้าสู่ระบบสำเร็จ");
        await refreshListings();
      }
    } catch (error) { setAuthMessage(error.message || "เกิดข้อผิดพลาด"); }
    finally { byId("authSubmit").disabled = false; }
  });
  byId("logoutBtn").addEventListener("click", async () => {
    const { error } = await client.auth.signOut();
    if (error) return say(error.message);
    session = null; updateAccountUI(); say("ออกจากระบบแล้ว");
  });

  // ลงประกาศออนไลน์: ต้องล็อกอินและบันทึกลงฐานข้อมูลส่วนกลาง
  document.addEventListener("click", event => {
    const button = event.target.closest("#openPostTop,#openPostHero,#openPostBottom");
    if (!button) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (!session?.user) { openAuth(); setAuthMessage("เข้าสู่ระบบก่อน จึงจะลงประกาศได้"); return; }
    openModal();
  }, true);

  byId("postForm").addEventListener("submit", async event => {
    event.preventDefault(); event.stopImmediatePropagation();
    if (!session?.user) { openAuth(); setAuthMessage("เข้าสู่ระบบก่อน จึงจะลงประกาศได้"); return; }
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") || "").trim();
    const province = String(form.get("province") || "").trim();
    const description = String(form.get("description") || "").trim();
    if (!title || !province || !description) return say("กรุณากรอกข้อมูลให้ครบ");
    const payload = {
      owner_id: session.user.id, title, animal_type: String(form.get("type")),
      province, description, image_url: String(form.get("image") || "").trim() || null,
      status: String(form.get("status")), age: null, sex: null, health: null,
      latitude: null, longitude: null
    };
    const submit = event.currentTarget.querySelector('[type="submit"]');
    submit.disabled = true;
    const { data, error } = await client.from("listings").insert(payload).select("*").single();
    submit.disabled = false;
    if (error) { console.error(error); say("บันทึกประกาศไม่สำเร็จ: " + error.message); return; }
    closeModal();
    await refreshListings();
    const saved = toAnimal(data);
    selectedId = saved.id;
    if (map) map.setView([15.8700,100.9925],6);
    say("เผยแพร่ประกาศออนไลน์แล้ว");
    byId("explore").scrollIntoView({behavior:"smooth"});
  }, true);

  // Chat is a real user-to-user conversation, not the former simulated AI.
  function addRealMessage(message, who, senderLabel) {
    const row = document.createElement("div"); row.className = "chat-message " + who;
    const bubble = document.createElement("div"); bubble.className = "chat-bubble";
    bubble.textContent = senderLabel ? senderLabel + ": " + message : message;
    row.appendChild(bubble); byId("chatMessages").appendChild(row);
    byId("chatMessages").scrollTop = byId("chatMessages").scrollHeight;
  }
  async function loadMessages(conversationId) {
    const { data, error } = await client.from("messages").select("*")
      .eq("conversation_id", conversationId).order("created_at", {ascending:true});
    if (error) { say("โหลดข้อความไม่ได้: " + error.message); return; }
    byId("chatMessages").innerHTML = "";
    (data || []).forEach(message => addRealMessage(message.body,
      message.sender_id === session.user.id ? "user" : "bot",
      message.sender_id === session.user.id ? "" : "ผู้สนทนา"));
  }
  function subscribeMessages(conversationId) {
    if (realtimeChannel) client.removeChannel(realtimeChannel);
    realtimeChannel = client.channel("messages-" + conversationId)
      .on("postgres_changes", {event:"INSERT",schema:"public",table:"messages",filter:"conversation_id=eq."+conversationId},
        payload => {
          const m = payload.new;
          if (m.sender_id !== session?.user?.id) addRealMessage(m.body, "bot", "ผู้สนทนา");
        }).subscribe();
  }
  openChat = async function() {
    if (!chatAnimal) return;
    if (!session?.user) { openAuth(); setAuthMessage("เข้าสู่ระบบก่อน จึงจะส่งข้อความถึงผู้ลงประกาศได้"); return; }
    if (chatAnimal.demo || !chatAnimal.owner_id) {
      say("รายการนี้เป็นข้อมูลตัวอย่าง จึงยังไม่มีเจ้าของบัญชีให้แชทด้วย");
      return;
    }
    if (chatAnimal.owner_id === session.user.id) {
      say("นี่คือประกาศของคุณเอง คุณไม่จำเป็นต้องเปิดแชทกับตัวเอง");
      return;
    }
    closeDetail();
    byId("chatTitle").textContent = "แชทกับผู้ลงประกาศ";
    byId("chatSubtitle").textContent = "ข้อความส่งถึงผู้ใช้จริงในบัญชีนี้";
    byId("chatPet").textContent = "เรื่องประกาศ: " + chatAnimal.title + " · " + chatAnimal.province;
    byId("chatMessages").innerHTML = "";
    byId("chatModal").hidden = false; document.body.style.overflow = "hidden";
    const { data: existing, error: findError } = await client.from("conversations")
      .select("*").eq("listing_id", chatAnimal.id).eq("buyer_id", session.user.id).maybeSingle();
    if (findError) { say("ค้นหาบทสนทนาไม่ได้: " + findError.message); return; }
    let conversation = existing;
    if (!conversation) {
      const { data, error } = await client.from("conversations").insert({
        listing_id: chatAnimal.id, buyer_id: session.user.id, owner_id: chatAnimal.owner_id
      }).select("*").single();
      if (error) {
        console.error(error); say("เริ่มแชทไม่ได้: " + error.message);
        addRealMessage("ยังเริ่มบทสนทนาไม่ได้ กรุณาตรวจสอบการตั้งค่า Supabase", "bot"); return;
      }
      conversation = data;
    }
    await openExistingConversation({...conversation, listings:{title:chatAnimal.title,province:chatAnimal.province,animal_type:chatAnimal.type}});
  };
  byId("startAdoptionChat").addEventListener("click", event => { event.stopImmediatePropagation(); openChat(); }, true);
  byId("chatForm").addEventListener("submit", async event => {
    event.preventDefault(); event.stopImmediatePropagation();
    const body = byId("chatInput").value.trim();
    if (!body || !activeConversation || !session?.user) return;
    const input = byId("chatInput"); const send = event.currentTarget.querySelector('[type="submit"]');
    input.value = ""; send.disabled = true;
    const { data, error } = await client.from("messages").insert({
      conversation_id: activeConversation.id, sender_id: session.user.id, body
    }).select("*").single();
    send.disabled = false;
    if (error) { input.value = body; say("ส่งข้อความไม่สำเร็จ: " + error.message); return; }
    addRealMessage(data.body, "user");
  }, true);
  byId("closeChat").addEventListener("click", () => {
    activeConversation = null;
    if (realtimeChannel) { client.removeChannel(realtimeChannel); realtimeChannel = null; }
  });

  async function openExistingConversation(conversation) {
    activeConversation = conversation;
    byId("inboxModal").hidden = true;
    byId("chatTitle").textContent = "แชทกับผู้ใช้";
    byId("chatSubtitle").textContent = "ข้อความส่งถึงผู้ใช้จริงในบัญชีนี้";
    const listing = conversation.listings;
    byId("chatPet").textContent = "เรื่องประกาศ: " + (listing?.title || "ประกาศสัตว์") + (listing?.province ? " · " + listing.province : "");
    byId("chatMessages").innerHTML = "";
    byId("chatModal").hidden = false; document.body.style.overflow = "hidden";
    await loadMessages(conversation.id);
    subscribeMessages(conversation.id);
    byId("chatInput").placeholder = "พิมพ์ข้อความ...";
    byId("chatInput").focus();
  }

  async function openInbox() {
    if (!session?.user) { openAuth(); return; }
    byId("inboxModal").hidden = false;
    byId("inboxList").innerHTML = '<p class="empty-state">กำลังโหลดบทสนทนา...</p>';
    const { data, error } = await client.from("conversations")
      .select("*, listings(title, province, animal_type)")
      .order("created_at", {ascending:false});
    if (error) {
      console.error(error);
      byId("inboxList").innerHTML = '<p class="empty-state">โหลดกล่องข้อความไม่ได้ โปรดตรวจสอบ SQL/RLS ใน Supabase</p>';
      return;
    }
    if (!data?.length) {
      byId("inboxList").innerHTML = '<p class="empty-state">ยังไม่มีข้อความ เริ่มได้จากปุ่มแชทในประกาศที่ลงโดยสมาชิกจริง</p>';
      return;
    }
    byId("inboxList").innerHTML = data.map(c => {
      const name = c.listings?.title || "ประกาศสัตว์";
      const role = c.owner_id === session.user.id ? "คุณเป็นผู้ลงประกาศ" : "คุณสนใจประกาศนี้";
      return '<button type="button" class="inbox-item" data-conversation-id="' + c.id + '"><strong>' +
        escapeHtml(name) + '</strong><span>' + escapeHtml(role) + '</span><small>' +
        escapeHtml(c.listings?.province || "") + '</small></button>';
    }).join("");
    byId("inboxList").querySelectorAll("[data-conversation-id]").forEach(button => {
      button.addEventListener("click", async () => {
        const conversation = data.find(c => c.id === button.dataset.conversationId);
        if (conversation) await openExistingConversation(conversation);
      });
    });
  }
  byId("inboxBtn").addEventListener("click", openInbox);
  byId("closeInbox").addEventListener("click", () => byId("inboxModal").hidden = true);
  byId("inboxModal").addEventListener("click", event => { if (event.target === byId("inboxModal")) byId("inboxModal").hidden = true; });

  client.auth.getSession().then(async ({data, error}) => {
    if (error) console.error(error);
    session = data?.session || null;
    updateAccountUI();
    await refreshListings();
  });
  client.auth.onAuthStateChange((_event, nextSession) => {
    session = nextSession;
    updateAccountUI();
    if (session) refreshListings();
  });
})();
