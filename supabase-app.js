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
  let inboxRealtimeChannel = null;
  let choosingListingLocation = false;
  const unreadConversations = new Set();
  const unreadDot = () => byId("inboxUnreadDot");
  function updateUnreadDot() {
    const dot = unreadDot();
    if (dot) dot.hidden = unreadConversations.size === 0;
  }
  function markUnread(conversationId) {
    if (!conversationId || activeConversation?.id === conversationId) return;
    unreadConversations.add(conversationId);
    updateUnreadDot();
  }
  function markRead(conversationId) {
    unreadConversations.delete(conversationId);
    updateUnreadDot();
  }
  function subscribeInboxNotifications() {
    if (inboxRealtimeChannel) client.removeChannel(inboxRealtimeChannel);
    if (!session?.user) { inboxRealtimeChannel = null; return; }
    inboxRealtimeChannel = client.channel("inbox-notifications-" + session.user.id)
      .on("postgres_changes", {event:"INSERT",schema:"public",table:"messages"},
        async payload => {
          const message = payload.new;
          if (message.sender_id === session?.user?.id) return;
          const {data: conversation, error} = await client.from("conversations")
            .select("id,buyer_id,owner_id").eq("id", message.conversation_id).maybeSingle();
          if (error || !conversation ||
              (conversation.buyer_id !== session?.user?.id && conversation.owner_id !== session?.user?.id)) return;
          if (activeConversation?.id === conversation.id && !byId("chatModal").hidden) {
            loadMessages(conversation.id);
          } else {
            markUnread(conversation.id);
          }
        }).subscribe();
  }

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
  document.addEventListener("click", event => {
    const b = event.target.closest("[data-detail]");
    if (!b) return;
    setTimeout(() => {
      const a = animals.find(item => item.id === b.dataset.detail);
      if (!a) return;
      selectedId = a.id;
      const owner = !!session?.user && a.owner_id === session.user.id && !a.demo;
      byId("deleteListingBtn").hidden = !owner;
      const buyer = !!session?.user && activeConversation?.listing_id === a.id && activeConversation?.buyer_id === session.user.id;
      byId("confirmAdoptionBtn").hidden = !(owner || buyer);
      byId("confirmAdoptionBtn").textContent = owner ? "ยืนยันว่ามอบน้องให้บ้านใหม่แล้ว" : "ยืนยันว่ารับน้องแล้ว";
      byId("adoptionStatus").hidden = a.demo;
      byId("adoptionStatus").textContent = "ผู้สนใจ: " + (a.adoption_buyer_confirmed ? "ยืนยันแล้ว" : "รอยืนยัน") + " · ผู้ลงประกาศ: " + (a.adoption_owner_confirmed ? "ยืนยันแล้ว" : "รอยืนยัน");
    }, 0);
  }, true);
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
    lat: row.latitude ?? undefined, lng: row.longitude ?? undefined, status: row.status, image: row.image_url || "", adoption_buyer_confirmed: !!row.adoption_buyer_confirmed, adoption_owner_confirmed: !!row.adoption_owner_confirmed
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
        ? await client.auth.signUp({
            email,
            password,
            options: {
              data: { display_name: displayName },
              data: { display_name: displayName }
            }
          })
        : await client.auth.signInWithPassword({ email, password });
      if (result.error) {
        const message = String(result.error.message || "");
        if (!signupMode && /email not confirmed/i.test(message)) {
          throw new Error("อีเมลนี้ยังไม่ได้ยืนยัน กรุณาเปิดอีเมลและกดลิงก์ยืนยันก่อนเข้าสู่ระบบ");
        }
        throw result.error;
      }
      if (signupMode) {
        // Beta mode expects Supabase Confirm email to be disabled, so sign-up returns a session.
        session = result.data.session;
        if (!session) {
          setAuthMessage("บัญชีถูกสร้างแล้ว แต่ยังไม่ได้เข้าสู่ระบบ กรุณาปิด Confirm email ใน Supabase: Authentication → Sign In / Providers → Email แล้วลองเข้าสู่ระบบ");
          return;
        }
        updateAccountUI();
        subscribeInboxNotifications();
        byId("authModal").hidden = true;
        say("สมัครสมาชิกและเข้าสู่ระบบสำเร็จ");
        await refreshListings();
      } else {
        session = result.data.session;
        updateAccountUI();
        byId("authModal").hidden = true;
        say("เข้าสู่ระบบสำเร็จ");
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
      status: String(form.get("status")), age: String(form.get("age") || "").trim() || null, sex: String(form.get("sex") || "").trim() || null, health: String(form.get("health") || "").trim() || null,
      latitude: form.get("latitude") ? Number(form.get("latitude")) : null,
      longitude: form.get("longitude") ? Number(form.get("longitude")) : null
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
    if (map && Number.isFinite(saved.lat) && Number.isFinite(saved.lng)) map.setView([saved.lat,saved.lng],13);
    say(saved.lat != null && saved.lng != null ? "เผยแพร่ประกาศพร้อมตำแหน่งบนแผนที่แล้ว" : "เผยแพร่ประกาศแล้ว แต่ยังไม่มีหมุดบนแผนที่");
    byId("explore").scrollIntoView({behavior:"smooth"});
  }, true);


  // Extend the existing detail modal for owner actions, including map-popup entry points.
  const originalOpenDetail = window.openDetail;
  if (typeof originalOpenDetail === "function") {
    window.openDetail = function(id) {
      originalOpenDetail(id);
      selectedId = id;
      const a = animals.find(item => item.id === id);
      if (!a) return;
      const owner = !!session?.user && a.owner_id === session.user.id && !a.demo;
      const buyer = !!session?.user && activeConversation?.listing_id === a.id && activeConversation?.buyer_id === session.user.id;
      byId("deleteListingBtn").hidden = !owner;
      byId("confirmAdoptionBtn").hidden = !(owner || buyer);
      byId("confirmAdoptionBtn").textContent = owner ? "ยืนยันว่ามอบน้องให้บ้านใหม่แล้ว" : "ยืนยันว่ารับน้องแล้ว";
      byId("adoptionStatus").hidden = !!a.demo;
      byId("adoptionStatus").textContent = "ผู้สนใจ: " + (a.adoption_buyer_confirmed ? "ยืนยันแล้ว" : "รอยืนยัน") + " · ผู้ลงประกาศ: " + (a.adoption_owner_confirmed ? "ยืนยันแล้ว" : "รอยืนยัน");
    };
  }

  // Choose an exact map point for a listing; no location is collected without a click.
  byId("chooseListingLocation").addEventListener("click", () => {
    choosingListingLocation = true;
    byId("postModal").hidden = true;
    document.body.style.overflow = "";
    byId("explore").scrollIntoView({behavior:"smooth"});
    say("คลิกบนแผนที่เพื่อปักหมุดตำแหน่งน้อง");
    document.body.classList.add("location-picking");
  });
  if (map) map.on("click", event => {
    if (!choosingListingLocation) return;
    byId("listingLatitude").value = event.latlng.lat.toFixed(6);
    byId("listingLongitude").value = event.latlng.lng.toFixed(6);
    choosingListingLocation = false;
    document.body.classList.remove("location-picking");
    byId("postModal").hidden = false;
    document.body.style.overflow = "hidden";
    say("เลือกตำแหน่งแล้ว กดบันทึกประกาศเพื่อยืนยัน");
  });
  // Owner can remove their own listing from the shared map.
  byId("deleteListingBtn").addEventListener("click", async () => {
    const a = animals.find(item => item.id === selectedId);
    if (!a || a.demo || a.owner_id !== session?.user?.id) return say("ลบได้เฉพาะประกาศของบัญชีคุณ");
    if (!confirm("ต้องการลบประกาศนี้ออกจากแผนที่ใช่ไหม?")) return;
    const {error} = await client.from("listings").delete().eq("id", a.id).eq("owner_id", session.user.id);
    if (error) return say("ลบประกาศไม่สำเร็จ: " + error.message);
    if (typeof closeDetail === "function") closeDetail(); else { byId("detailModal").hidden = true; document.body.style.overflow = ""; }
    document.body.classList.remove("location-picking");
    document.body.style.overflow = "";
    await refreshListings();
    say("ลบประกาศออกจากแผนที่แล้ว");
  });
  byId("confirmAdoptionBtn").addEventListener("click", async () => {
    const a = animals.find(item => item.id === selectedId);
    if (!a || a.demo || !session?.user) return say("ต้องเข้าสู่ระบบและเลือกประกาศออนไลน์ก่อน");
    const isOwner = a.owner_id === session.user.id;
    const isBuyer = activeConversation?.listing_id === a.id && activeConversation?.buyer_id === session.user.id;
    if (!isOwner && !isBuyer) return say("ผู้ยืนยันต้องเป็นผู้ลงประกาศหรือผู้สนใจที่เริ่มแชทกับประกาศนี้");
    const field = isOwner ? "adoption_owner_confirmed" : "adoption_buyer_confirmed";
    const nextBuyer = isOwner ? !!a.adoption_buyer_confirmed : true;
    const nextOwner = isOwner ? true : !!a.adoption_owner_confirmed;
    const patch = {[field]: true};
    if (nextBuyer && nextOwner) patch.status = "adopted";
    const {error} = await client.from("listings").update(patch).eq("id",a.id);
    if (error) return say("บันทึกการยืนยันไม่สำเร็จ โปรดรัน SQL อัปเดตใน supabase-schema.sql แล้วลองอีกครั้ง");
    await refreshListings();
    const updated = animals.find(item=>item.id===a.id);
    byId("adoptionStatus").hidden = false;
    byId("adoptionStatus").textContent = "ผู้สนใจ: " + (updated?.adoption_buyer_confirmed ? "ยืนยันแล้ว" : "รอยืนยัน") + " · ผู้ลงประกาศ: " + (updated?.adoption_owner_confirmed ? "ยืนยันแล้ว" : "รอยืนยัน");
    say("บันทึกการยืนยันของคุณแล้ว");
  });
  // Message author may delete their own message.
  async function deleteOwnMessage(messageId) {
    if (!session?.user || !activeConversation) return;
    if (!confirm("ต้องการยกเลิกข้อความนี้สำหรับทุกคนใช่ไหม? ข้อความจะถูกลบออกจากบทสนทนาทั้งสองฝ่าย")) return;
    const {error} = await client.from("messages").delete().eq("id",messageId).eq("sender_id",session.user.id);
    if (error) return say("ลบข้อความไม่ได้ โปรดรัน SQL อัปเดตใน supabase-schema.sql: " + error.message);
    await loadMessages(activeConversation.id);
    say("ยกเลิกข้อความสำหรับทุกคนแล้ว");
  }

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
    (data || []).forEach(message => {
      addRealMessage(message.body, message.sender_id === session.user.id ? "user" : "bot",
        message.sender_id === session.user.id ? "" : "ผู้สนทนา");
      const row = byId("chatMessages").lastElementChild;
      if (message.sender_id === session.user.id) {
        const remove = document.createElement("button");
        remove.type = "button"; remove.className = "message-delete"; remove.textContent = "ยกเลิกข้อความ";
        remove.addEventListener("click", () => deleteOwnMessage(message.id));
        row.appendChild(remove);
      }
    });
  }
  function subscribeMessages(conversationId) {
    if (realtimeChannel) client.removeChannel(realtimeChannel);
    realtimeChannel = client.channel("messages-" + conversationId)
      .on("postgres_changes", {event:"INSERT",schema:"public",table:"messages",filter:"conversation_id=eq."+conversationId},
        payload => {
          const m = payload.new;
          if (m.sender_id !== session?.user?.id) {
            if (activeConversation?.id === conversationId && !byId("chatModal").hidden) {
              loadMessages(conversationId);
            } else {
              markUnread(conversationId);
            }
          }
        })
      .on("postgres_changes", {event:"DELETE",schema:"public",table:"messages"},
        () => {
          if (activeConversation?.id === conversationId) loadMessages(conversationId);
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
    markRead(conversation.id);
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
    updateUnreadDot();
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
    subscribeInboxNotifications();
    await refreshListings();
  });
  client.auth.onAuthStateChange((_event, nextSession) => {
    session = nextSession;
    updateAccountUI();
    subscribeInboxNotifications();
    if (session) refreshListings();
  });
})();
