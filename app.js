/* ════════════════════════════════════
   PILA BARBEARIA – APP.JS (Firebase)
════════════════════════════════════ */

// ── CONFIGURAÇÃO FIREBASE ────────────────────────────────────
// ⚠ SUBSTITUA pelos dados do SEU projeto Firebase:
const FIREBASE_CONFIG = {
  apiKey:            "SUA_API_KEY",
  authDomain:        "SEU_PROJETO.firebaseapp.com",
  projectId:         "SEU_PROJETO_ID",
  storageBucket:     "SEU_PROJETO.appspot.com",
  messagingSenderId: "SEU_SENDER_ID",
  appId:             "SEU_APP_ID",
};

// ── SENHAS DOS BARBEIROS ─────────────────────────────────────
const PASSWORDS = {
  'pila123':  'Rafael King',
  'pila2026': 'Marcos Silva',
};

// ── HORÁRIOS ─────────────────────────────────────────────────
function generateSlots() {
  const slots = [];
  for (let h = 9; h <= 19; h++) {
    slots.push(`${String(h).padStart(2,'0')}:00`);
    if (h < 20) slots.push(`${String(h).padStart(2,'0')}:30`);
  }
  return slots;
}
const ALL_SLOTS = generateSlots();

// ── ESTADO LOCAL ─────────────────────────────────────────────
let selectedTime     = null;
let appointments     = [];   // sempre vem do Firestore
let loggedIn         = false;
let adminWho         = '';
let lastBookedId     = null;
let db               = null;
let unsubscribeAdmin = null;

// ── INICIALIZAR FIREBASE ─────────────────────────────────────
async function initFirebase() {
  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
  const { getFirestore, collection, addDoc, getDocs, deleteDoc, doc,
          updateDoc, query, where, orderBy, onSnapshot }
    = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');

  const app = initializeApp(FIREBASE_CONFIG);
  db = getFirestore(app);

  // Guarda funções no global para uso nas outras funções
  window._fs = { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, query, where, orderBy, onSnapshot };

  await loadAppointmentsForDate(document.getElementById('bookingDate').value);
}

// ── CARREGAR AGENDAMENTOS DE UMA DATA (picker de horários) ────
async function loadAppointmentsForDate(date) {
  if (!db || !date) return;
  const { collection, query, where, getDocs } = window._fs;
  const q    = query(collection(db, 'appointments'), where('date', '==', date));
  const snap = await getDocs(q);
  appointments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderTimeSlots();
}

// ── NAVBAR SCROLL ────────────────────────────────────────────
const navbar = document.getElementById('navbar');
if (navbar) {
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 6);
  }, { passive: true });
}

// ── DATA MÍNIMA ──────────────────────────────────────────────
const dateInput = document.getElementById('bookingDate');
const todayStr  = new Date().toISOString().split('T')[0];
dateInput.min   = todayStr;
dateInput.value = todayStr;
renderTimeSlots(); // renderiza vazio enquanto Firebase carrega

// Inicia Firebase
initFirebase().catch(err => {
  console.error('Erro Firebase:', err);
  toast('⚠ Erro de conexão. Recarregue a página.');
});

// ── QUANDO MUDA A DATA ───────────────────────────────────────
document.getElementById('bookingDate').addEventListener('change', async () => {
  const date = document.getElementById('bookingDate').value;
  renderTimeSlots();
  if (db) await loadAppointmentsForDate(date);
});

// ── RENDERIZAR HORÁRIOS ──────────────────────────────────────
function renderTimeSlots() {
  const container = document.getElementById('timeSlots');
  const date      = document.getElementById('bookingDate').value;

  const box = document.getElementById('slotPickerBox');
  const dd  = document.getElementById('slotDropdown');
  const lbl = document.getElementById('slotPickerLabel');
  box.classList.remove('open');
  dd.classList.remove('open');
  lbl.textContent = 'Selecione um horário';
  lbl.classList.remove('selected');

  if (!date) { container.innerHTML = ''; return; }

  const booked = appointments.filter(a => a.date === date).map(a => a.time);

  selectedTime = null;

  const groups = [
    { label: 'Manhã', slots: ALL_SLOTS.filter(s => parseInt(s) < 12) },
    { label: 'Tarde', slots: ALL_SLOTS.filter(s => parseInt(s) >= 12) },
  ];

  container.innerHTML = groups.map(g => `
    <div class="slot-group">
      <div class="slot-group-label">${g.label}</div>
      <div class="slot-row">
        ${g.slots.map(slot => {
          const taken = booked.includes(slot);
          return `<button class="time-slot${taken ? ' taken' : ''}" ${taken ? 'disabled' : `onclick="selectTime(this)"`}>${slot}</button>`;
        }).join('')}
      </div>
    </div>
  `).join('');
}

function toggleSlots() {
  const box  = document.getElementById('slotPickerBox');
  const dd   = document.getElementById('slotDropdown');
  const open = box.classList.toggle('open');
  dd.classList.toggle('open', open);
}

function closeSlots() {
  document.getElementById('slotPickerBox').classList.remove('open');
  document.getElementById('slotDropdown').classList.remove('open');
}

function selectTime(btn) {
  document.querySelectorAll('.time-slot').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedTime = btn.textContent;
  const lbl = document.getElementById('slotPickerLabel');
  lbl.textContent = selectedTime;
  lbl.classList.add('selected');
  closeSlots();
  if (navigator.vibrate) navigator.vibrate(25);
}

// ── CONFIRMAR AGENDAMENTO ─────────────────────────────────────
async function confirmBooking() {
  const name    = document.getElementById('clientName').value.trim();
  const phone   = document.getElementById('clientPhone').value.trim();
  const barber  = 'Pila';
  const service = document.getElementById('serviceSelect').value;
  const date    = document.getElementById('bookingDate').value;

  if (!name)             return shakeField('clientName',    'Informe seu nome');
  if (phone.length < 10) return shakeField('clientPhone',   'Telefone inválido (mín. 10 números)');
  if (!service)          return shakeField('serviceSelect', 'Escolha um serviço');
  if (!date)             return shakeField('bookingDate',   'Escolha uma data');
  if (!selectedTime)     return toast('⚠ Selecione um horário');
  if (!db)               return toast('⚠ Sem conexão. Recarregue a página.');

  // Verifica corrida simultânea (dois clientes no mesmo horário ao mesmo tempo)
  const { collection, query, where, getDocs, addDoc } = window._fs;
  const checkQ    = query(collection(db, 'appointments'), where('date', '==', date), where('time', '==', selectedTime));
  const checkSnap = await getDocs(checkQ);
  if (!checkSnap.empty) {
    toast('⚠ Esse horário acabou de ser ocupado. Escolha outro.');
    await loadAppointmentsForDate(date);
    return;
  }

  // Desabilita botão para evitar duplo clique
  const btn = document.querySelector('#bookingForm .btn-gold');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

  try {
    const appt = { name, phone, barber, service, date, time: selectedTime, done: false, created: new Date().toISOString() };
    const docRef = await addDoc(collection(db, 'appointments'), appt);
    lastBookedId = docRef.id;

    const [y,m,d] = date.split('-');
    document.getElementById('successMsg').textContent =
      `📅 ${d}/${m}/${y} às ${selectedTime}\n✂ ${service}\n💈 ${barber}`;
    document.getElementById('bookingForm').style.display = 'none';
    const ok = document.getElementById('bookingSuccess');
    ok.classList.add('show');
    ok.scrollIntoView({ behavior: 'smooth', block: 'center' });

  } catch (err) {
    console.error(err);
    toast('⚠ Erro ao salvar. Tente novamente.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'CONFIRMAR AGENDAMENTO'; }
  }
}

function resetBooking() {
  document.getElementById('bookingForm').style.display = 'flex';
  document.getElementById('bookingSuccess').classList.remove('show');
  document.getElementById('clientName').value    = '';
  document.getElementById('clientPhone').value   = '';
  document.getElementById('serviceSelect').value = '';
  lastBookedId = null;
  selectedTime = null;
  loadAppointmentsForDate(document.getElementById('bookingDate').value);
}

// ── CANCELAMENTO ─────────────────────────────────────────────
function openCancelFromSuccess() {
  document.getElementById('cancelSection').scrollIntoView({ behavior: 'smooth' });
  const phone = document.getElementById('clientPhone').value;
  if (phone) {
    document.getElementById('cancelPhone').value = phone;
    searchCancel();
  }
}

async function searchCancel() {
  const phone = document.getElementById('cancelPhone').value.trim();
  const res   = document.getElementById('cancelResults');
  if (phone.length < 10) {
    res.innerHTML = '<p class="cancel-msg error">⚠ Digite um telefone válido (mín. 10 números).</p>';
    return;
  }
  if (!db) { res.innerHTML = '<p class="cancel-msg error">⚠ Sem conexão.</p>'; return; }

  res.innerHTML = '<p class="cancel-msg">Buscando...</p>';

  const { collection, query, where, getDocs } = window._fs;
  const q    = query(collection(db, 'appointments'), where('phone', '==', phone));
  const snap = await getDocs(q);
  const found = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(a => !a.done);

  if (found.length === 0) {
    res.innerHTML = '<p class="cancel-msg">Nenhum agendamento ativo encontrado para esse telefone.</p>';
    return;
  }

  res.innerHTML = found.map(a => {
    const [y,m,d2] = a.date.split('-');
    return `
      <div class="cancel-card">
        <div class="cancel-card-info">
          <span class="cancel-time">${a.time} · ${d2}/${m}/${y}</span>
          <span class="cancel-name">${a.name}</span>
          <span class="cancel-svc">✂ ${a.service}</span>
        </div>
        <button class="btn-del-cancel" onclick="confirmCancel('${a.id}')">Cancelar</button>
      </div>`;
  }).join('');
}

async function confirmCancel(id) {
  if (!confirm('Tem certeza que deseja cancelar este agendamento?')) return;
  const { doc, deleteDoc } = window._fs;
  await deleteDoc(doc(db, 'appointments', id));
  toast('✓ Agendamento cancelado com sucesso');
  searchCancel();
}

// ── LOGIN MODAL ──────────────────────────────────────────────
document.getElementById('lockBtn').addEventListener('click', openLogin);

function openLogin() {
  const ov = document.getElementById('loginOverlay');
  ov.classList.add('open');
  setTimeout(() => document.getElementById('adminPass').focus(), 350);
  document.getElementById('loginError').classList.remove('show');
  document.getElementById('adminPass').value = '';
}
function closeLogin() {
  document.getElementById('loginOverlay').classList.remove('open');
}
document.getElementById('loginOverlay').addEventListener('click', e => {
  if (e.target === document.getElementById('loginOverlay')) closeLogin();
});
document.getElementById('adminPass').addEventListener('keydown', e => {
  if (e.key === 'Enter') doLogin();
});

function doLogin() {
  const pw = document.getElementById('adminPass').value.trim();
  if (PASSWORDS[pw]) {
    adminWho = PASSWORDS[pw];
    loggedIn = true;
    closeLogin();
    showAdmin();
  } else {
    document.getElementById('loginError').classList.add('show');
    document.getElementById('adminPass').style.borderColor = '#e05252';
    document.getElementById('adminPass').style.animation   = 'shake 0.35s ease';
    setTimeout(() => {
      document.getElementById('adminPass').style.animation   = '';
      document.getElementById('adminPass').style.borderColor = '';
    }, 500);
  }
}

function togglePw() {
  const inp = document.getElementById('adminPass');
  inp.type  = inp.type === 'password' ? 'text' : 'password';
}

// ── PAINEL ADMIN ─────────────────────────────────────────────
function showAdmin() {
  document.getElementById('publicPage').style.display = 'none';
  document.getElementById('adminPage').style.display  = 'block';

  const af = document.getElementById('adminDate');
  af.value = todayStr;
  af.min   = '';

  startAdminListener();
}

function doLogout() {
  if (unsubscribeAdmin) { unsubscribeAdmin(); unsubscribeAdmin = null; }
  loggedIn = false; adminWho = '';
  document.getElementById('publicPage').style.display = 'block';
  document.getElementById('adminPage').style.display  = 'none';
}

// Listener em tempo real: painel atualiza sozinho quando chega agendamento novo
function startAdminListener() {
  if (!db) return;
  if (unsubscribeAdmin) unsubscribeAdmin();

  const { collection, onSnapshot, orderBy, query } = window._fs;
  const q = query(collection(db, 'appointments'), orderBy('date'), orderBy('time'));

  unsubscribeAdmin = onSnapshot(q, snap => {
    window._adminAll = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAdminStatic(window._adminAll);
  });
}

function renderAdmin() {
  if (window._adminAll) renderAdminStatic(window._adminAll);
}

function renderAdminStatic(allAppointments) {
  const dateF   = document.getElementById('adminDate').value;
  const barberF = document.getElementById('adminBarberFilter').value;

  let filtered = [...allAppointments];
  if (dateF)   filtered = filtered.filter(a => a.date === dateF);
  if (barberF) filtered = filtered.filter(a => a.barber === barberF);

  filtered.sort((a,b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.time.localeCompare(b.time);
  });

  const total   = filtered.length;
  const done    = filtered.filter(a => a.done).length;
  const pending = total - done;

  document.getElementById('statTotal').textContent   = total;
  document.getElementById('statDone').textContent    = done;
  document.getElementById('statPending').textContent = pending;

  const list = document.getElementById('apptList');
  if (filtered.length === 0) {
    list.innerHTML = '<div class="appt-empty">📅 Nenhum agendamento encontrado</div>';
    return;
  }

  list.innerHTML = filtered.map(a => {
    const [y,m,d] = a.date.split('-');
    return `
    <div class="appt-card ${a.done ? 'done' : ''}" id="card-${a.id}">
      <div class="appt-head">
        <span class="appt-time">${a.time}</span>
        <span class="appt-status ${a.done ? 'done' : 'pending'}">${a.done ? 'Concluído' : 'Pendente'}</span>
      </div>
      <div class="appt-client">${a.name}</div>
      <div class="appt-meta">
        ✂ ${a.service}<br/>
        💈 ${a.barber}<br/>
        📅 ${d}/${m}/${y}<br/>
        📞 ${a.phone || '—'}
      </div>
      <div class="appt-actions">
        ${!a.done ? `<button class="appt-btn complete" onclick="markDone('${a.id}')">✓ Concluir</button>` : ''}
        <button class="appt-btn delete" onclick="deleteAppt('${a.id}')">🗑 Remover</button>
      </div>
    </div>`;
  }).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  const adminDate = document.getElementById('adminDate');
  if (adminDate) adminDate.addEventListener('change', renderAdmin);
});

async function markDone(id) {
  const { doc, updateDoc } = window._fs;
  await updateDoc(doc(db, 'appointments', id), { done: true });
}

async function deleteAppt(id) {
  const { doc, deleteDoc } = window._fs;
  await deleteDoc(doc(db, 'appointments', id));
}

async function clearAll() {
  if (!confirm('Tem certeza? Isso apagará TODOS os agendamentos.')) return;
  const { collection, getDocs, doc, deleteDoc } = window._fs;
  const snap = await getDocs(collection(db, 'appointments'));
  await Promise.all(snap.docs.map(d => deleteDoc(doc(db, 'appointments', d.id))));
}

// ── UTILITÁRIOS ──────────────────────────────────────────────
function shakeField(id, msg) {
  const el = document.getElementById(id);
  el.style.borderColor = '#e05252';
  el.style.animation   = 'shake 0.35s ease';
  setTimeout(() => { el.style.animation = ''; el.style.borderColor = ''; }, 500);
  toast('⚠ ' + msg);
}

function toast(msg) {
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  Object.assign(t.style, {
    position: 'fixed', bottom: '88px', left: '50%',
    transform: 'translateX(-50%) translateY(8px)',
    background: '#1c1a16', color: '#f2ede4',
    border: '1px solid rgba(201,168,76,0.22)',
    borderRadius: '100px', padding: '10px 20px',
    fontSize: '13px', fontFamily: 'DM Sans, sans-serif',
    zIndex: '9999', opacity: '0',
    transition: 'all 0.25s ease', whiteSpace: 'nowrap',
    boxShadow: '0 8px 28px rgba(0,0,0,0.5)',
  });
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => {
    t.style.opacity = '1';
    t.style.transform = 'translateX(-50%) translateY(0)';
  });
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateX(-50%) translateY(8px)';
    setTimeout(() => t.remove(), 250);
  }, 2600);
}