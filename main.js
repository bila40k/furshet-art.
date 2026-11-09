(function () {
  'use strict';

  // 1. НАЛАШТУВАННЯ SUPABASE
  const SUPABASE_URL = 'https://bsgwtxupiolgqupvrlyt.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJzZ3d0eHVwaW9sZ3F1cHZybHl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2NDMwNjAsImV4cCI6MjEwNDIxOTA2MH0.WT0AGCa0sHzYpFwGYA_0Df7VQmpjDNJlDwHXZ0X9Khc';
  
  const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
  const AUTH_STORAGE_KEY = 'sb-bsgwtxupiolgqupvrlyt-auth-token';
  const BUCKET = 'product-images';
  const IS_ADMIN_PAGE = !!document.getElementById('admin-login-section');

  // Звичайним відвідувачам бібліотека Supabase не потрібна: каталог і заявки йдуть напряму через REST.
  // Бібліотеку підвантажуємо лише для адміна (вхід, додавання/видалення робіт, перегляд заявок).
  let clientPromise = null;
  function getClient() {
    if (clientPromise) return clientPromise;
    clientPromise = new Promise((resolve, reject) => {
      const create = () => {
        try { resolve(window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)); }
        catch (e) { clientPromise = null; reject(e); }
      };
      if (window.supabase && typeof window.supabase.createClient === 'function') return create();
      const s = document.createElement('script');
      s.src = SUPABASE_JS;
      s.async = true;
      s.onload = create;
      s.onerror = () => { clientPromise = null; reject(new Error('Не вдалося завантажити Supabase')); };
      document.head.appendChild(s);
    });
    return clientPromise;
  }

  const hasStoredSession = () => {
    try { return !!localStorage.getItem(AUTH_STORAGE_KEY); } catch (e) { return false; }
  };

  async function rest(path, options = {}) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...options,
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, ...(options.headers || {}) }
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { const j = await res.json(); msg = j.message || msg; } catch (e) { /* без тіла */ }
      throw new Error(msg);
    }
    return res;
  }

  const PRODUCTS_QUERY = 'products?select=id,name,price,image_url&order=created_at.desc';
  const fetchProducts = () => rest(PRODUCTS_QUERY).then(r => r.json());
  // Починаємо вантажити каталог одразу, не чекаючи решти сторінки
  let productsPrefetch = document.getElementById('product-grid') ? fetchProducts() : null;
  if (productsPrefetch) productsPrefetch.catch(() => {});

  let _validSession = null;
  let cart = [];

  // 2. УТИЛІТИ ТА UI
  // Заглушка, якщо фото роботи немає або воно не завантажилось
  const PLACEHOLDER_IMG = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500"><defs><radialGradient id="g" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#1b1712"/><stop offset="1" stop-color="#0a0a0a"/></radialGradient></defs><rect width="400" height="500" fill="url(#g)"/><path fill="#C9A876" opacity=".55" d="M200 205c3 15 13 26 28 29-15 3-25 14-28 29-3-15-13-26-28-29 15-3 25-14 28-29z"/><text x="200" y="310" fill="#C9A876" opacity=".5" font-family="Georgia,serif" font-style="italic" font-size="20" text-anchor="middle">Furshet Carving</text></svg>'
  );

  // Плавна поява блоків при прокрутці
  const revealObserver = ('IntersectionObserver' in window)
    ? new IntersectionObserver((entries) => {
        entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); revealObserver.unobserve(e.target); } });
      }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' })
    : null;
  function observeReveal(el) {
    if (revealObserver) revealObserver.observe(el); else el.classList.add('in');
  }

  const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let lenis = null; // плавна прокрутка (створюється нижче, якщо доступна)

  // Розбиваємо заголовки на слова, щоб вони «виїжджали» з-під маски по черзі
  function splitHeading(el) {
    if (el.classList.contains('split-ready')) return;
    if (REDUCED_MOTION) { el.classList.add('split-ready', 'in'); return; }
    let i = 0;
    const walk = (node, cls) => {
      const frag = document.createDocumentFragment();
      Array.from(node.childNodes).forEach(child => {
        if (child.nodeType === 3) {
          child.textContent.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
            const word = document.createElement('span');
            word.className = 'split-word';
            const inner = document.createElement('span');
            inner.className = ('split-inner ' + cls).trim();
            inner.style.setProperty('--i', i++);
            inner.textContent = part;
            word.appendChild(inner);
            frag.appendChild(word);
          });
        } else if (child.nodeName === 'BR') {
          frag.appendChild(child.cloneNode(false));
        } else if (child.nodeType === 1) {
          const childCls = (cls + ' ' + child.className.replace(/\bpr-\d+\b/g, '')).trim();
          frag.appendChild(walk(child, childCls));
        }
      });
      return frag;
    };
    el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
    const frag = walk(el, '');
    el.textContent = '';
    el.appendChild(frag);
    el.querySelectorAll('.split-word').forEach(w => w.setAttribute('aria-hidden', 'true'));
    el.classList.add('split-ready');
  }
  document.querySelectorAll('[data-split]').forEach(el => {
    splitHeading(el);
    if (el.hasAttribute('data-split-now')) {
      el.style.setProperty('--base', '150ms');
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
    } else {
      observeReveal(el);
    }
  });

  // Плавне відкриття/закриття вікон (працює і для вікон без анімації — просто показ/приховування)
  const MODAL_CLOSE_MS = 650;
  let openModalsCount = 0;
  function openModal(el) {
    if (!el || el.classList.contains('is-open')) return;
    clearTimeout(el._closeTimer);
    const wasHidden = el.classList.contains('hidden');
    el.classList.remove('hidden');
    void el.offsetWidth; // перерахунок стилів, щоб анімація стартувала з початкового стану
    el.classList.add('is-open');
    if (wasHidden) {
      openModalsCount++;
      document.documentElement.style.overflow = 'hidden';
      if (lenis) lenis.stop();
    }
    const focusTarget = el.querySelector('.close-x, button, a, input');
    if (focusTarget) setTimeout(() => focusTarget.focus({ preventScroll: true }), 60);
  }
  function closeModal(el) {
    if (!el || el.classList.contains('hidden') || !el.classList.contains('is-open')) return;
    el.classList.remove('is-open');
    const delay = el.classList.contains('modal') ? MODAL_CLOSE_MS : 0;
    el._closeTimer = setTimeout(() => {
      el.classList.add('hidden');
      openModalsCount = Math.max(0, openModalsCount - 1);
      if (openModalsCount === 0) {
        document.documentElement.style.overflow = '';
        if (lenis) lenis.start();
      }
    }, delay);
  }

  // Мʼяка «хвиля» від натискання на золоті та контурні кнопки
  document.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('.btn-gold, .btn-outline');
    if (!btn || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const r = btn.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2.2;
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left}px;top:${e.clientY - r.top}px`;
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 800);
  });

  function escapeHTML(str) {
    if (!str) return '';
    return str.toString().replace(/[&<>'"]/g, tag => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag] || tag));
  }

  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    const borderColor = type === 'error' ? 'border-red-500/60' : (type === 'success' ? 'border-[#C5A47E]' : 'border-stone-700');
    const icon = type === 'error' ? '✕' : (type === 'success' ? '✓' : 'ℹ');

    toast.className = `pointer-events-auto flex items-center gap-3 bg-[#111111]/95 border ${borderColor} text-stone-200 px-4 py-3 rounded-xl shadow-2xl backdrop-blur-md text-xs tracking-wide transform transition-all duration-300 translate-y-2 opacity-0 w-full sm:w-auto mt-2`;
    toast.innerHTML = `<span class="w-5 h-5 shrink-0 flex items-center justify-center rounded-full bg-stone-900 text-[#C5A47E] font-bold text-[11px]">${icon}</span><span class="flex-1">${message}</span>`;
    
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.remove('translate-y-2', 'opacity-0'));
    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  function showConfirmDialog(title, message) {
    return new Promise((resolve) => {
      const modal = document.getElementById('confirm-modal');
      const titleEl = document.getElementById('confirm-title');
      const msgEl = document.getElementById('confirm-message');
      const okBtn = document.getElementById('confirm-ok-btn');
      const cancelBtn = document.getElementById('confirm-cancel-btn');
      const backdrop = document.getElementById('confirm-backdrop');

      if (!modal || !okBtn || !cancelBtn) { resolve(false); return; }

      if (titleEl) titleEl.textContent = title;
      if (msgEl) msgEl.textContent = message;
      openModal(modal);

      function cleanup(result) {
        closeModal(modal);
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        if (backdrop) backdrop.removeEventListener('click', onCancel);
        resolve(result);
      }

      function onOk() { cleanup(true); }
      function onCancel() { cleanup(false); }

      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
      if (backdrop) backdrop.addEventListener('click', onCancel);
    });
  }

  // 3. АВТОРИЗАЦІЯ (АДМІН)
  function isAdminLoggedIn() {
    return Boolean(_validSession && _validSession.access_token && typeof _validSession.access_token === 'string');
  }

  let authListenerAttached = false;
  async function checkAuthSession() {
    // На головній без збереженого входу нічого не вантажимо — відвідувач точно не адмін
    if (!IS_ADMIN_PAGE && !hasStoredSession()) { _validSession = null; return; }
    try {
      const client = await getClient();
      if (!authListenerAttached) {
        authListenerAttached = true;
        client.auth.onAuthStateChange((event, session) => { _validSession = session; updateAdminUI(); });
      }
      const { data: { session }, error } = await client.auth.getSession();
      _validSession = (!error && session) ? session : null;
      updateAdminUI();
    } catch (err) {
      _validSession = null;
      updateAdminUI();
    }
  }

  function updateAdminUI() {
    const isAuth = isAdminLoggedIn();
    
    // Для сторінки адмінки
    const loginSec = document.getElementById('admin-login-section');
    const dashSec = document.getElementById('admin-dashboard-section');
    if (loginSec && dashSec) {
      if (isAuth) {
        loginSec.classList.add('hidden');
        dashSec.classList.remove('hidden');
        loadOrders(); // Завантажуємо замовлення тільки коли зайшли
      } else {
        loginSec.classList.remove('hidden');
        dashSec.classList.add('hidden');
      }
    }

    // Показуємо/ховаємо кнопки видалення на головній
    document.querySelectorAll('.admin-delete-btn').forEach(btn => {
      btn.style.display = isAuth ? 'inline-block' : 'none';
    });
  }

  async function handleAdminFormSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('admin-email-input')?.value.trim();
    const password = document.getElementById('admin-password-input')?.value.trim();
    const err = document.getElementById('admin-auth-error');
    const btnText = document.getElementById('admin-login-text');
    const btnLoader = document.getElementById('admin-login-loader');

    if (!email || !password) return;
    if (btnText) btnText.classList.add('hidden');
    if (btnLoader) btnLoader.classList.remove('hidden');
    if (err) err.classList.add('hidden');

    try {
      const client = await getClient();
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      _validSession = data.session;
      updateAdminUI();
      showToast('Успішна авторизація!', 'success');
    } catch (authError) {
      if (err) {
        err.textContent = 'Невірний email або пароль!';
        err.classList.remove('hidden');
      } else {
        showToast('Помилка: ' + authError.message, 'error');
      }
    } finally {
      if (btnText) btnText.classList.remove('hidden');
      if (btnLoader) btnLoader.classList.add('hidden');
    }
  }

  async function logoutAdmin() {
    try { const client = await getClient(); await client.auth.signOut(); } catch (e) { /* все одно виходимо локально */ }
    _validSession = null;
    updateAdminUI();
    showToast('Ви вийшли з панелі', 'info');
  }

  // 4. КОШИК ТА ОФОРМЛЕННЯ ЗАМОВЛЕННЯ
  function toggleCart(show) {
    const cartModal = document.getElementById('cart-modal');
    if (!cartModal) return;
    if (show) openModal(cartModal); else closeModal(cartModal);
  }

  const formatPrice = (n) => `${Number(n).toLocaleString('uk-UA')} грн`;
  const cartCount = () => cart.reduce((s, i) => s + i.qty, 0);
  const cartTotal = () => cart.reduce((s, i) => s + i.price * i.qty, 0);

  function updateCartUI() {
    const cartBadge = document.getElementById('cart-badge');
    const cartItemsEl = document.getElementById('cart-items');
    const cartTotalEl = document.getElementById('cart-total');

    if (!cartBadge || !cartItemsEl || !cartTotalEl) return;

    const count = cartCount();
    cartBadge.textContent = count;
    if (count > 0) cartBadge.classList.remove('scale-0');
    else cartBadge.classList.add('scale-0');

    if (cart.length === 0) {
      cartItemsEl.innerHTML = '<p class="text-stone-500 text-center font-light py-12 font-serif italic text-xl">Кошик порожній</p>';
      cartTotalEl.textContent = '0 грн';
      return;
    }

    cartItemsEl.innerHTML = '';
    cart.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between gap-4 bg-[#111] p-4 border border-stone-800';
      row.innerHTML = `
        <div class="min-w-0">
          <div class="font-serif italic text-stone-100 text-lg leading-snug truncate">${escapeHTML(item.name)}</div>
          <div class="text-[11px] text-gold mt-0.5">${formatPrice(item.price)}</div>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <button type="button" data-act="dec" aria-label="Менше" class="w-8 h-8 border border-stone-800 text-stone-400 hover:text-white hover:border-stone-600 transition">−</button>
          <span class="w-7 text-center text-sm text-stone-200">${item.qty}</span>
          <button type="button" data-act="inc" aria-label="Більше" class="w-8 h-8 border border-stone-800 text-stone-400 hover:text-white hover:border-stone-600 transition">+</button>
        </div>
      `;
      row.querySelector('[data-act="dec"]').addEventListener('click', () => {
        item.qty -= 1;
        if (item.qty <= 0) cart.splice(idx, 1);
        updateCartUI();
      });
      row.querySelector('[data-act="inc"]').addEventListener('click', () => { item.qty += 1; updateCartUI(); });
      cartItemsEl.appendChild(row);
    });
    cartTotalEl.textContent = formatPrice(cartTotal());
  }

  function addToCart(name, price) {
    const existing = cart.find(i => i.name === name && i.price === price);
    if (existing) existing.qty += 1;
    else cart.push({ name, price, qty: 1 });
    updateCartUI();
    showToast(`Додано до замовлення: «${escapeHTML(name)}»`, 'success');
  }

  function openCheckoutModal() {
    if (cart.length === 0) { showToast('Кошик порожній!', 'error'); return; }
    toggleCart(false);
    const modal = document.getElementById('checkout-modal');
    const form = document.getElementById('checkout-form');
    const success = document.getElementById('checkout-success');
    if (modal) {
      if (form) form.classList.remove('hidden');
      if (success) success.classList.add('hidden');
      // Кошик спершу відʼїжджає, потім зʼявляється вікно оформлення
      setTimeout(() => openModal(modal), 260);
    }
  }

  function closeCheckoutModal() {
    closeModal(document.getElementById('checkout-modal'));
  }

  async function submitCheckout(e) {
    e.preventDefault();
    const lastOrderTime = localStorage.getItem('lastOrderTime');
    if (lastOrderTime && (Date.now() - parseInt(lastOrderTime) < 60000)) {
      showToast('Ви вже оформили замовлення. Зачекайте хвилину.', 'error'); return;
    }

    const name = document.getElementById('client-name').value.trim();
    const phone = document.getElementById('client-phone').value.trim();
    const btnText = document.getElementById('checkout-btn-text');
    const btnLoader = document.getElementById('checkout-btn-loader');

    if (!name || !phone || cart.length === 0) return;

    const totalPrice = cartTotal();
    const itemsList = cart.map(item =>
      item.qty > 1 ? `${item.name} ×${item.qty} (${item.price * item.qty} грн)` : `${item.name} (${item.price} грн)`
    ).join(', ');

    if (btnText) btnText.classList.add('hidden');
    if (btnLoader) btnLoader.classList.remove('hidden');

    try {
      // Текст зберігаємо як є — екранування робиться при виводі
      await rest('orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify([{ client_name: name, client_phone: phone, items: itemsList, total_price: totalPrice, status: 'new' }])
      });

      // Сповіщення майстру в Telegram (не блокує клієнта, якщо щось піде не так)
      fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, items: itemsList, total: totalPrice }),
        keepalive: true
      }).catch(() => {});

      localStorage.setItem('lastOrderTime', Date.now().toString());
      cart = []; updateCartUI();

      const form = document.getElementById('checkout-form');
      const success = document.getElementById('checkout-success');
      if (form) form.classList.add('hidden');
      if (success) success.classList.remove('hidden');
      showToast('Замовлення успішно збережено!', 'success');
    } catch (err) {
      showToast('Помилка: ' + err.message, 'error');
    } finally {
      if (btnText) btnText.classList.remove('hidden');
      if (btnLoader) btnLoader.classList.add('hidden');
    }
  }

  // 5. КАТАЛОГ ТА ПРОДУКТИ
  async function loadProducts() {
    const grid = document.getElementById('product-grid');
    if (!grid) return;

    try {
      let data;
      if (productsPrefetch) { data = await productsPrefetch; productsPrefetch = null; }
      else data = await fetchProducts();
      if (!Array.isArray(data) || data.length === 0) {
        grid.innerHTML = '<div class="text-center py-12 text-stone-500 col-span-full font-light">Каталог порожній</div>';
        return;
      }

      const isAuth = isAdminLoggedIn();
      grid.innerHTML = '';
      data.forEach((p, i) => {
        const safeName = escapeHTML(p.name);
        const safeImgUrl = p.image_url ? encodeURI(p.image_url) : PLACEHOLDER_IMG;
        const num = String(i + 1).padStart(2, '0');

        const card = document.createElement('article');
        card.className = `reveal ${['', 'd1', 'd2'][i % 3]} group flex flex-col`;
        card.innerHTML = `
          <div class="curtain relative overflow-hidden aspect-[4/5] bg-[#0e0e0e]">
            <img src="${safeImgUrl}" alt="${safeName}" loading="lazy" decoding="async" width="800" height="1000" class="product-img w-full h-full object-cover transition-transform duration-[1400ms] ease-out group-hover:scale-[1.06]">
            <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/10 pointer-events-none"></div>
            <div class="absolute inset-3 sm:inset-4 border border-gold/0 group-hover:border-gold/40 transition-colors duration-700 pointer-events-none"></div>
            <span class="absolute top-5 left-5 sm:top-6 sm:left-6 font-serif italic text-gold/90 text-lg">№ ${num}</span>
          </div>
          <div class="pt-5 sm:pt-6 flex items-start justify-between gap-4">
            <h3 class="font-serif text-2xl sm:text-[26px] leading-tight text-stone-100 group-hover:text-gold-200 transition-colors">${safeName}</h3>
            <p class="font-serif text-xl sm:text-2xl text-gold whitespace-nowrap pt-0.5">${formatPrice(p.price)}</p>
          </div>
          <div class="mt-5 flex items-center justify-between gap-3">
            <button type="button" class="buy-btn btn-outline flex-1 py-3.5 border border-stone-800 text-[10.5px] uppercase tracking-[0.28em] text-stone-300">
              Додати до замовлення
            </button>
            <button type="button" class="admin-delete-btn text-[10px] uppercase tracking-widest text-stone-600 hover:text-red-400 transition cursor-pointer p-1" style="display: ${isAuth ? 'inline-block' : 'none'};">Видалити</button>
          </div>
        `;

        const img = card.querySelector('.product-img');
        if (img) img.addEventListener('error', () => { img.src = PLACEHOLDER_IMG; }, { once: true });

        const buyBtn = card.querySelector('.buy-btn');
        if (buyBtn) buyBtn.addEventListener('click', () => addToCart(p.name, p.price));

        const delBtn = card.querySelector('.admin-delete-btn');
        if (delBtn) delBtn.addEventListener('click', () => deleteProduct(p));

        grid.appendChild(card);
        observeReveal(card);
      });
    } catch (err) {
      console.warn("Помилка завантаження каталогу:", err);
    }
  }

  async function handleAddProduct(e) {
    e.preventDefault();
    if (!isAdminLoggedIn()) { showToast('Потрібна авторизація!', 'error'); return; }

    const name = document.getElementById('prod-name').value.trim();
    const price = parseFloat(document.getElementById('prod-price').value);
    const urlInput = document.getElementById('prod-img');
    const imgUrl = urlInput ? urlInput.value.trim() : '';
    const imageBlob = window.loadedImageBlob || null;

    if (!name || isNaN(price)) { showToast('Заповніть назву та ціну!', 'error'); return; }

    const btnText = document.getElementById('btn-add-text');
    const btnLoader = document.getElementById('btn-add-loader');
    if (btnText) btnText.classList.add('hidden');
    if (btnLoader) btnLoader.classList.remove('hidden');

    try {
      const client = await getClient();
      let finalImage = imgUrl || null;

      // Фото завантажуємо у сховище (Storage), а в базу пишемо лише посилання —
      // так каталог вантажиться швидко, а фото кешуються браузером
      if (imageBlob) {
        const ext = imageBlob.type === 'image/webp' ? 'webp' : 'jpg';
        const path = `products/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await client.storage.from(BUCKET).upload(path, imageBlob, {
          contentType: imageBlob.type, cacheControl: '31536000', upsert: false
        });
        if (upErr) throw new Error('Не вдалося завантажити фото: ' + upErr.message);
        finalImage = client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      }

      const { error } = await client.from('products').insert([{
        name: name, price: price, image_url: finalImage, status: 'available'
      }]);
      if (error) throw error;
      showToast('Нову композицію опубліковано!', 'success');
      e.target.reset();
      window.loadedImageBlob = null;
      const previewWrapper = document.getElementById('image-preview-wrapper');
      if (previewWrapper) previewWrapper.classList.add('hidden');
      loadProducts();
    } catch (err) {
      showToast(err.message || 'Помилка збереження', 'error');
    } finally {
      if (btnText) btnText.classList.remove('hidden');
      if (btnLoader) btnLoader.classList.add('hidden');
    }
  }

  async function deleteProduct(product) {
    if (!isAdminLoggedIn()) return;
    const confirmed = await showConfirmDialog('Видалення роботи', 'Видалити цю роботу з каталогу?');
    if (!confirmed) return;
    try {
      const client = await getClient();
      const { error } = await client.from('products').delete().eq('id', product.id);
      if (error) throw error;
      // Прибираємо і сам файл фото зі сховища, щоб не займав місце
      const marker = `/storage/v1/object/public/${BUCKET}/`;
      if (product.image_url && product.image_url.includes(marker)) {
        const path = decodeURIComponent(product.image_url.split(marker)[1].split('?')[0]);
        client.storage.from(BUCKET).remove([path]).catch(() => {});
      }
      showToast('Роботу видалено', 'info');
      loadProducts();
    } catch (err) { showToast('Помилка видалення', 'error'); }
  }

  // 6. ЗАМОВЛЕННЯ (АДМІН)
  async function loadOrders() {
    const container = document.getElementById('orders-container');
    if (!container || !isAdminLoggedIn()) return;

    try {
      const client = await getClient();
      const { data, error } = await client.from('orders').select('*').order('created_at', { ascending: false });
      if (error) throw error;

      if (!data || data.length === 0) {
        container.innerHTML = '<p class="text-stone-500 text-center font-light py-4">Ще немає замовлень</p>';
        return;
      }

      container.innerHTML = '';
      data.forEach(o => {
        const date = new Date(o.created_at).toLocaleString('uk-UA');
        const card = document.createElement('div');
        card.className = 'bg-[#141414] border border-stone-800 p-4 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4';
        card.innerHTML = `
          <div class="space-y-1 w-full sm:w-auto">
            <div class="flex items-center justify-between sm:justify-start gap-3">
              <span class="font-serif italic text-lg text-stone-100">${escapeHTML(o.client_name)}</span>
              <a href="tel:${escapeHTML(o.client_phone)}" class="text-xs text-[#C5A47E] bg-[#C5A47E]/10 px-2 py-0.5 rounded hover:bg-[#C5A47E]/20 transition">${escapeHTML(o.client_phone)}</a>
            </div>
            <div class="text-xs text-stone-400 font-light">Товари: <span class="text-stone-200">${escapeHTML(o.items)}</span></div>
            <div class="text-[10px] text-stone-500">${date}</div>
          </div>
          <div class="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end border-t border-stone-800/60 sm:border-0 pt-2 sm:pt-0">
            <span class="font-serif text-lg text-[#C5A47E]">${o.total_price} грн</span>
            <button type="button" class="del-order-btn text-stone-600 hover:text-red-400 text-xs uppercase tracking-wider transition cursor-pointer p-1">Видалити</button>
          </div>
        `;
        const delBtn = card.querySelector('.del-order-btn');
        if (delBtn) delBtn.addEventListener('click', () => deleteOrder(o.id));
        container.appendChild(card);
      });
    } catch (err) { console.warn('Помилка завантаження замовлень:', err); }
  }

  async function deleteOrder(id) {
    if (!isAdminLoggedIn()) return;
    const confirmed = await showConfirmDialog('Видалення заявки', 'Видалити це замовлення з історії?');
    if (!confirmed) return;
    try {
      const client = await getClient();
      const { error } = await client.from('orders').delete().eq('id', id);
      if (error) throw error;
      showToast('Замовлення видалено', 'info');
      loadOrders();
    } catch (err) { showToast('Помилка видалення', 'error'); }
  }

  // ІНІЦІАЛІЗАЦІЯ ПІД ЧАС ЗАВАНТАЖЕННЯ
  document.addEventListener('DOMContentLoaded', () => {
    checkAuthSession();

    // Слухачі для головної сторінки (index.html)
    const cartBtn = document.getElementById('cart-toggle-btn');
    if (cartBtn) cartBtn.addEventListener('click', () => toggleCart(true));
    
    const cartCloseBtn = document.getElementById('cart-close-btn');
    if (cartCloseBtn) cartCloseBtn.addEventListener('click', () => toggleCart(false));
    
    const cartBackdrop = document.getElementById('cart-backdrop');
    if (cartBackdrop) cartBackdrop.addEventListener('click', () => toggleCart(false));

    const cartCheckoutBtn = document.getElementById('cart-checkout-btn');
    if (cartCheckoutBtn) cartCheckoutBtn.addEventListener('click', openCheckoutModal);

    const checkoutForm = document.getElementById('checkout-form');
    if (checkoutForm) checkoutForm.addEventListener('submit', submitCheckout);

    const checkoutCloseBtn = document.getElementById('checkout-close-btn');
    if (checkoutCloseBtn) checkoutCloseBtn.addEventListener('click', closeCheckoutModal);

    const checkoutCancelBtn = document.getElementById('checkout-cancel-btn');
    if (checkoutCancelBtn) checkoutCancelBtn.addEventListener('click', closeCheckoutModal);

    const checkoutBackdrop = document.getElementById('checkout-backdrop');
    if (checkoutBackdrop) checkoutBackdrop.addEventListener('click', closeCheckoutModal);

    const orderModal = document.getElementById('order-modal');
    if (orderModal) {
      document.querySelectorAll('.open-order-modal').forEach(btn =>
        btn.addEventListener('click', () => openModal(orderModal)));
      document.getElementById('order-modal-close-btn')?.addEventListener('click', () => closeModal(orderModal));
      document.getElementById('order-modal-backdrop')?.addEventListener('click', () => closeModal(orderModal));
    }

    // Escape закриває будь-яке відкрите вікно
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      closeModal(orderModal);
      closeCheckoutModal();
      toggleCart(false);
    });

    // Плавна інерційна прокрутка (на компʼютері; на телефоні лишається рідна прокрутка)
    if (window.Lenis && !REDUCED_MOTION && document.getElementById('site-header')) {
      try {
        lenis = new window.Lenis({ duration: 1.15, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true });
        const raf = (time) => { lenis.raf(time); requestAnimationFrame(raf); };
        requestAnimationFrame(raf);
        document.documentElement.classList.remove('scroll-smooth');
      } catch (e) { lenis = null; }
    }

    // Посилання-якорі (#catalog, #about…) — плавно і з урахуванням висоти шапки
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href^="#"]');
      if (!a || !lenis) return;
      const id = a.getAttribute('href');
      const target = (id === '#' || id === '#top') ? 0 : document.querySelector(id);
      if (target === null) return;
      e.preventDefault();
      lenis.scrollTo(target, { offset: target === 0 ? 0 : -72, duration: 1.6 });
      if (id.length > 1) history.replaceState(null, '', id);
    });

    // Легкий паралакс фото (фото повільніше рухається за прокруткою)
    const parallaxEls = REDUCED_MOTION ? [] : Array.from(document.querySelectorAll('[data-parallax]'));
    if (parallaxEls.length) {
      let ticking = false;
      const update = () => {
        ticking = false;
        const vh = window.innerHeight;
        parallaxEls.forEach(img => {
          const r = img.parentElement.getBoundingClientRect();
          if (r.bottom < -100 || r.top > vh + 100) return;
          const offset = (r.top + r.height / 2 - vh / 2) * parseFloat(img.dataset.parallax);
          img.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0) scale(1.14)`;
        });
      };
      const onScrollPx = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
      window.addEventListener('scroll', onScrollPx, { passive: true });
      window.addEventListener('resize', onScrollPx, { passive: true });
      update();
    }

    // Шапка стає матовою при прокрутці
    const header = document.getElementById('site-header');
    if (header) {
      const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 24);
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }

    document.querySelectorAll('.reveal').forEach(observeReveal);
    const yearEl = document.getElementById('year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    loadProducts();

    // Слухачі для сторінки адмінки (admin.html)
    const adminForm = document.getElementById('admin-login-form');
    if (adminForm) adminForm.addEventListener('submit', handleAdminFormSubmit);

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', logoutAdmin);

    const refreshOrdersBtn = document.getElementById('refresh-orders-btn');
    if (refreshOrdersBtn) refreshOrdersBtn.addEventListener('click', loadOrders);

    const addForm = document.getElementById('add-product-form');
    if (addForm) addForm.addEventListener('submit', handleAddProduct);

    // Логіка підготовки фото для адмінки
    // Фото стискаємо прямо в браузері (до 1400px, формат WebP) — і лише потім вантажимо у сховище
    window.loadedImageBlob = null;
    const fileInput = document.getElementById('prod-file');
    const urlInput = document.getElementById('prod-img');
    const previewWrapper = document.getElementById('image-preview-wrapper');
    const previewImg = document.getElementById('image-preview');
    const submitBtn = document.getElementById('btn-add-submit');

    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        window.loadedImageBlob = null;
        if (!file) return;
        if (submitBtn) submitBtn.disabled = true; // поки фото готується
        const srcUrl = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          const maxDim = 1400;
          let w = img.naturalWidth, h = img.naturalHeight;
          if (w > maxDim || h > maxDim) {
            if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
            else { w = Math.round((w * maxDim) / h); h = maxDim; }
          }
          const canvasEl = document.createElement('canvas');
          canvasEl.width = w; canvasEl.height = h;
          canvasEl.getContext('2d').drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(srcUrl);
          const done = (blob) => {
            if (submitBtn) submitBtn.disabled = false;
            if (!blob) { showToast('Не вдалося обробити фото', 'error'); return; }
            window.loadedImageBlob = blob;
            if (previewImg && previewWrapper) {
              previewImg.src = URL.createObjectURL(blob);
              previewWrapper.classList.remove('hidden');
              previewWrapper.classList.add('flex');
            }
            if (urlInput) urlInput.value = '';
          };
          // WebP легший за JPEG; якщо браузер не вміє WebP — беремо JPEG
          canvasEl.toBlob((blob) => {
            if (blob && blob.type === 'image/webp') done(blob);
            else canvasEl.toBlob(done, 'image/jpeg', 0.85);
          }, 'image/webp', 0.84);
        };
        img.onerror = () => { if (submitBtn) submitBtn.disabled = false; showToast('Цей файл не схожий на фото', 'error'); };
        img.src = srcUrl;
      });
    }

    if (urlInput) {
      urlInput.addEventListener('input', () => {
        if (urlInput.value.trim() !== '') {
          window.loadedImageBlob = null;
          if (fileInput) fileInput.value = '';
          if (previewWrapper) previewWrapper.classList.add('hidden');
        }
      });
    }

    // Живі шпалери (тільки там, де є canvas)
    const canvas = document.getElementById('bg-canvas');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      let width, height;
      let particles = [];
      const particleCount = REDUCED_MOTION ? 0 : (window.innerWidth < 768 ? 16 : 40);

      function resizeCanvas() { width = canvas.width = window.innerWidth; height = canvas.height = window.innerHeight; }
      window.addEventListener('resize', resizeCanvas, { passive: true });
      resizeCanvas();

      class Particle {
        constructor() { this.reset(); this.y = Math.random() * height; }
        reset() {
          this.x = Math.random() * width; this.y = height + Math.random() * 50;
          this.size = Math.random() * 1.8 + 0.6;
          this.speedY = Math.random() * 0.35 + 0.12; this.speedX = (Math.random() - 0.5) * 0.15;
          this.alpha = Math.random() * 0.5 + 0.2;
        }
        update() {
          this.y -= this.speedY; this.x += this.speedX;
          if (this.y < -10 || this.x < -10 || this.x > width + 10) this.reset();
        }
        draw() {
          ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(197, 164, 126, ${this.alpha})`; ctx.fill();
        }
      }

      for (let i = 0; i < particleCount; i++) particles.push(new Particle());
      function animateParticles() {
        ctx.clearRect(0, 0, width, height);
        particles.forEach(p => { p.update(); p.draw(); });
        requestAnimationFrame(animateParticles);
      }
      animateParticles();
    }
  });
})();