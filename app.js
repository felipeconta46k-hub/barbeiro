/* ════════════════════════════════════
   BARBERKING – APP.JS (v2)
════════════════════════════════════ */

// ── SENHAS DOS BARBEIROS ─────────────────────────────────────
const PASSWORDS = {
  'pila123':  'Rafael King',
  'pila2026': 'Marcos Silva',
};

// ── HORÁRIOS (09:00 → 19:30, de 30 em 30 min) ────────────────
function generateSlots() {
  const slots = [];
  for (let h = 9; h <= 19; h++) {
    slots.push(`${String(h).padStart(2,'0')}:00`);
    if (h < 20) slots.push(`${String(h).padStart(2,'0')}:30`);
  }
  return slots;
}
const ALL_SLOTS = generateSlots();

// ── ESTADO ───────────────────────────────────────────────────
let selectedTime  = null;
let appointments  = JSON.parse(localStorage.getItem('bk_appointments') || '[]');
let loggedIn      = false;
let adminWho      = '';
let lastBookedId  = null;

// ── SALVAR ───────────────────────────────────────────────────
function save() {
  localStorage.setItem('bk_appointments', JSON.stringify(appointments));
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
dateInput.min = todayStr;
dateInput.value = todayStr;
renderTimeSlots();

// ── RENDERIZAR HORÁRIOS ──────────────────────────────────────
function renderTimeSlots() {
  const container = document.getElementById('timeSlots');
  const date      = document.getElementById('bookingDate').value;

  // Fechar e resetar o picker
  const box = document.getElementById('slotPickerBox');
  const dd  = document.getElementById('slotDropdown');
  const lbl = document.getElementById('slotPickerLabel');
  box.classList.remove('open');
  dd.classList.remove('open');
  lbl.textContent = 'Selecione um horário';
  lbl.classList.remove('selected');

  if (!date) { container.innerHTML = ''; return; }

  const booked = appointments
    .filter(a => a.date === date)
    .map(a => a.time);

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
  const box = document.getElementById('slotPickerBox');
  const dd  = document.getElementById('slotDropdown');
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

// ── BARBEIRO PRÉ-SELECIONADO ─────────────────────────────────
function selectBarber(name) {
  const sel = document.getElementById('barberSelect');
  if (sel) sel.value = name;
  document.getElementById('booking').scrollIntoView({ behavior: 'smooth' });
}

// ── CONFIRMAR AGENDAMENTO ─────────────────────────────────────
function confirmBooking() {
  const name    = document.getElementById('clientName').value.trim();
  const phone   = document.getElementById('clientPhone').value.trim();
  const barber  = 'Pila';
  const service = document.getElementById('serviceSelect').value;
  const date    = document.getElementById('bookingDate').value;

  if (!name)         return shakeField('clientName',   'Informe seu nome');
  if (phone.length < 10) return shakeField('clientPhone', 'Telefone inválido (mín. 10 números)');
  if (!service)      return shakeField('serviceSelect','Escolha um serviço');
  if (!date)         return shakeField('bookingDate',  'Escolha uma data');
  if (!selectedTime) return toast('⚠ Selecione um horário');

  const appt = {
    id:      Date.now(),
    name, phone, barber, service, date,
    time:    selectedTime,
    done:    false,
    created: new Date().toISOString(),
  };

  appointments.push(appt);
  save();
  lastBookedId = appt.id;

  const [y,m,d] = date.split('-');
  document.getElementById('successMsg').textContent =
    `📅 ${d}/${m}/${y} às ${selectedTime}\n✂ ${service}\n💈 ${barber}`;
  document.getElementById('bookingForm').style.display = 'none';
  const ok = document.getElementById('bookingSuccess');
  ok.classList.add('show');
  ok.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function resetBooking() {
  document.getElementById('bookingForm').style.display = 'flex';
  document.getElementById('bookingSuccess').classList.remove('show');
  document.getElementById('clientName').value   = '';
  document.getElementById('clientPhone').value  = '';
  document.getElementById('serviceSelect').value = '';
  lastBookedId = null;
  selectedTime = null;
  renderTimeSlots();
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

function searchCancel() {
  const phone = document.getElementById('cancelPhone').value.trim();
  const res   = document.getElementById('cancelResults');
  if (phone.length < 10) {
    res.innerHTML = '<p class="cancel-msg error">⚠ Digite um telefone válido (mín. 10 números).</p>';
    return;
  }

  const found = appointments.filter(a => a.phone === phone && !a.done);
  if (found.length === 0) {
    res.innerHTML = '<p class="cancel-msg">Nenhum agendamento ativo encontrado para esse telefone.</p>';
    return;
  }

  res.innerHTML = found.map(a => {
    const [y,m,d] = a.date.split('-');
    return `
      <div class="cancel-card">
        <div class="cancel-card-info">
          <span class="cancel-time">${a.time} · ${d}/${m}/${y}</span>
          <span class="cancel-name">${a.name}</span>
          <span class="cancel-svc">✂ ${a.service}</span>
        </div>
        <button class="btn-del-cancel" onclick="confirmCancel(${a.id})">Cancelar</button>
      </div>`;
  }).join('');
}

function confirmCancel(id) {
  if (!confirm('Tem certeza que deseja cancelar este agendamento?')) return;
  appointments = appointments.filter(x => x.id !== id);
  save();
  toast('✓ Agendamento cancelado com sucesso');
  searchCancel();
  if (loggedIn) renderAdmin();
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
    document.getElementById('adminPass').style.animation = 'shake 0.35s ease';
    setTimeout(() => {
      document.getElementById('adminPass').style.animation = '';
      document.getElementById('adminPass').style.borderColor = '';
    }, 500);
  }
}

function togglePw() {
  const inp = document.getElementById('adminPass');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

// ── PAINEL ADMIN ─────────────────────────────────────────────
function showAdmin() {
  document.getElementById('publicPage').style.display  = 'none';
  document.getElementById('adminPage').style.display   = 'block';
  document.getElementById('adminName') && (document.getElementById('adminName').textContent = adminWho);

  const af = document.getElementById('adminDate');
  af.value = todayStr;
  af.min   = '';

  renderAdmin();
}

function doLogout() {
  loggedIn = false; adminWho = '';
  document.getElementById('publicPage').style.display = 'block';
  document.getElementById('adminPage').style.display  = 'none';
}

function renderAdmin() {
  const dateF   = document.getElementById('adminDate').value;
  const barberF = document.getElementById('adminBarberFilter').value;

  let filtered = [...appointments];
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
        ${!a.done ? `<button class="appt-btn complete" onclick="markDone(${a.id})">✓ Concluir</button>` : ''}
        <button class="appt-btn delete" onclick="deleteAppt(${a.id})">🗑 Remover</button>
      </div>
    </div>`;
  }).join('');
}

function markDone(id) {
  const a = appointments.find(x => x.id === id);
  if (a) { a.done = true; save(); renderAdmin(); }
}

function deleteAppt(id) {
  appointments = appointments.filter(x => x.id !== id);
  save(); renderAdmin();
}

function clearAll() {
  if (!confirm('Tem certeza? Isso apagará TODOS os agendamentos.')) return;
  appointments = [];
  save(); renderAdmin();
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