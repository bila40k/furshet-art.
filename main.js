(function () {
  'use strict';

  // 1. НАЛАШТУВАННЯ SUPABASE
  const SUPABASE_URL = 'https://bsgwtxupiolgqupvrlyt.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJzZ3d0eHVwaW9sZ3F1cHZybHl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2NDMwNjAsImV4cCI6MjEwNDIxOTA2MH0.WT0AGCa0sHzYpFwGYA_0Df7VQmpjDNJlDwHXZ0X9Khc';
  
  let supabaseClient = null;
  try {
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
  } catch (e) {
    console.warn('Supabase fallback mode:', e);
  }

  let _validSession = null;
  let cart = [];

  // 2. УТИЛІТИ ТА UI
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
      modal.classList.remove('hidden');

      function cleanup(result) {
        modal.classList.add('hidden');
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

  async function checkAuthSession() {
    if (!supabaseClient) return;
    try {
      const { data: { session }, error } = await supabaseClient.auth.getSession();
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
      if (!supabaseClient) throw new Error('Supabase не підключено');
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
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
    if (supabaseClient) await supabaseClient.auth.signOut();
    _validSession = null;
    updateAdminUI();
    showToast('Ви вийшли з панелі', 'info');
  }

  // 4. КОШИК ТА ОФОРМЛЕННЯ ЗАМОВЛЕННЯ
  function toggleCart(show) {
    const cartModal = document.getElementById('cart-modal');
    if (!cartModal) return;
    if (show) {
      cartModal.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    } else {
      cartModal.classList.add('hidden');
      document.body.style.overflow = '';
    }
  }

  function updateCartUI() {
    const cartBadge = document.getElementById('cart-badge');
    const cartItemsEl = document.getElementById('cart-items');
    const cartTotalEl = document.getElementById('cart-total');
    
    if (!cartBadge || !cartItemsEl || !cartTotalEl) return;
    
    cartBadge.textContent = cart.length;
    if (cart.length > 0) cartBadge.classList.remove('scale-0');
    else cartBadge.classList.add('scale-0');

    if (cart.length === 0) {
      cartItemsEl.innerHTML = '<p class="text-stone-500 text-center font-light py-8">Кошик порожній</p>';
      cartTotalEl.textContent = '0 грн';
      return;
    }

    let total = 0;
    cartItemsEl.innerHTML = '';
    cart.forEach((item, idx) => {
      total += item.price;
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between bg-[#141414] p-3 rounded-lg border border-stone-800';
      row.innerHTML = `
        <div>
          <div class="font-serif italic text-stone-200 text-sm sm:text-base">${escapeHTML(item.name)}</div>
          <div class="text-[11px] text-[#C5A47E] font-medium">${item.price} грн</div>
        </div>
        <button type="button" class="del-cart-btn text-stone-600 hover:text-red-400 text-xs transition cursor-pointer p-1">Видалити</button>
      `;
      const delBtn = row.querySelector('.del-cart-btn');
      if (delBtn) delBtn.addEventListener('click', () => { cart.splice(idx, 1); updateCartUI(); });
      cartItemsEl.appendChild(row);
    });
    cartTotalEl.textContent = `${total} грн`;
  }

  function addToCart(name, price) {
    cart.push({ name, price });
    updateCartUI();
    showToast(`Додано в кошик: "${name}"`, 'success');
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
      modal.classList.remove('hidden');
    }
  }

  function closeCheckoutModal() {
    const modal = document.getElementById('checkout-modal');
    if (modal) modal.classList.add('hidden');
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

    let totalPrice = 0;
    const itemsList = cart.map(item => {
      totalPrice += item.price;
      return `${item.name} (${item.price} грн)`;
    }).join(', ');

    if (btnText) btnText.classList.add('hidden');
    if (btnLoader) btnLoader.classList.remove('hidden');

    try {
      if (!supabaseClient) throw new Error('Supabase не підключено');
      const { error } = await supabaseClient.from('orders').insert([{
        client_name: escapeHTML(name),
        client_phone: escapeHTML(phone),
        items: itemsList,
        total_price: totalPrice,
        status: 'new'
      }]);

      if (error) throw error;
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
    if (!supabaseClient) return;

    try {
      const { data, error } = await supabaseClient.from('products').select('*').order('created_at', { ascending: false });
      if (error || !data || data.length === 0) {
        grid.innerHTML = '<div class="text-center py-12 text-stone-500 col-span-full font-light">Каталог порожній</div>';
        return;
      }

      const isAuth = isAdminLoggedIn();
      grid.innerHTML = '';
      data.forEach(p => {
        const safeName = escapeHTML(p.name);
        const safeImgUrl = p.image_url ? encodeURI(p.image_url) : 'https://images.unsplash.com/photo-1546548970-71785318a17b?auto=format&fit=crop&w=600&q=80';

        const card = document.createElement('div');
        card.className = 'group relative bg-[#0d0d0d] border border-stone-800/80 rounded-xl overflow-hidden hover:border-[#C5A47E]/60 transition-all duration-300 flex flex-col justify-between';
        card.innerHTML = `
          <div class="overflow-hidden aspect-square relative bg-stone-950">
            <img src="${safeImgUrl}" alt="${safeName}" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-90 group-hover:opacity-100">
          </div>
          <div class="p-5 sm:p-6 flex flex-col justify-between flex-grow">
            <div>
              <h3 class="font-serif italic text-lg sm:text-xl text-stone-100 group-hover:text-[#C5A47E] transition-colors leading-snug">${safeName}</h3>
              <p class="text-xs sm:text-sm font-light text-[#C5A47E] mt-1">${p.price} грн</p>
            </div>
            <div class="mt-5 flex items-center justify-between pt-3 border-t border-stone-900">
              <button type="button" class="buy-btn text-[11px] sm:text-xs uppercase tracking-widest text-stone-300 hover:text-white transition flex items-center gap-1.5 cursor-pointer py-1">
                <span>Додати в кошик</span> →
              </button>
              <button type="button" class="admin-delete-btn text-[10px] uppercase tracking-widest text-stone-600 hover:text-red-400 transition cursor-pointer p-1" style="display: ${isAuth ? 'inline-block' : 'none'};">Видалити</button>
            </div>
          </div>
        `;

        const buyBtn = card.querySelector('.buy-btn');
        if (buyBtn) buyBtn.addEventListener('click', () => addToCart(p.name, p.price));
        
        const delBtn = card.querySelector('.admin-delete-btn');
        if (delBtn) delBtn.addEventListener('click', () => deleteProduct(p.id));

        grid.appendChild(card);
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
    // loadedBase64Image handled globally below
    const finalImage = window.loadedBase64Image || imgUrl || null;

    if (!name || isNaN(price)) { showToast('Заповніть назву та ціну!', 'error'); return; }

    const btnText = document.getElementById('btn-add-text');
    const btnLoader = document.getElementById('btn-add-loader');
    if (btnText) btnText.classList.add('hidden');
    if (btnLoader) btnLoader.classList.remove('hidden');

    try {
      if (!supabaseClient) throw new Error('Supabase не підключено');
      const { error } = await supabaseClient.from('products').insert([{
        name: escapeHTML(name), price: price, image_url: finalImage, status: 'available'
      }]);
      if (error) throw error;
      showToast('Нову композицію опубліковано!', 'success');
      e.target.reset();
      window.loadedBase64Image = '';
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

  async function deleteProduct(id) {
    if (!isAdminLoggedIn()) return;
    const confirmed = await showConfirmDialog('Видалення роботи', 'Видалити цю роботу з каталогу?');
    if (!confirmed) return;
    try {
      if (!supabaseClient) return;
      const { error } = await supabaseClient.from('products').delete().eq('id', id);
      if (error) throw error;
      showToast('Роботу видалено', 'info');
      loadProducts();
    } catch (err) { showToast('Помилка видалення', 'error'); }
  }

  // 6. ЗАМОВЛЕННЯ (АДМІН)
  async function loadOrders() {
    const container = document.getElementById('orders-container');
    if (!container || !supabaseClient || !isAdminLoggedIn()) return;

    try {
      const { data, error } = await supabaseClient.from('orders').select('*').order('created_at', { ascending: false });
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
      const { error } = await supabaseClient.from('orders').delete().eq('id', id);
      if (error) throw error;
      showToast('Замовлення видалено', 'info');
      loadOrders();
    } catch (err) { showToast('Помилка видалення', 'error'); }
  }

  // ІНІЦІАЛІЗАЦІЯ ПІД ЧАС ЗАВАНТАЖЕННЯ
  document.addEventListener('DOMContentLoaded', () => {
    checkAuthSession();
    if (supabaseClient) {
      supabaseClient.auth.onAuthStateChange((event, session) => {
        _validSession = session; updateAdminUI();
      });
    }

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

    const heroOrderBtn = document.getElementById('custom-order-hero-btn');
    const orderModal = document.getElementById('order-modal');
    if (heroOrderBtn && orderModal) {
      heroOrderBtn.addEventListener('click', () => orderModal.classList.remove('hidden'));
      document.getElementById('order-modal-close-btn')?.addEventListener('click', () => orderModal.classList.add('hidden'));
      document.getElementById('order-modal-backdrop')?.addEventListener('click', () => orderModal.classList.add('hidden'));
    }

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
    window.loadedBase64Image = '';
    const fileInput = document.getElementById('prod-file');
    const urlInput = document.getElementById('prod-img');
    const previewWrapper = document.getElementById('image-preview-wrapper');
    const previewImg = document.getElementById('image-preview');

    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
            const canvasEl = document.createElement('canvas');
            const maxDim = 900;
            let w = img.width, h = img.height;
            if (w > maxDim || h > maxDim) {
              if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; } 
              else { w = Math.round((w * maxDim) / h); h = maxDim; }
            }
            canvasEl.width = w; canvasEl.height = h;
            canvasEl.getContext('2d').drawImage(img, 0, 0, w, h);
            window.loadedBase64Image = canvasEl.toDataURL('image/jpeg', 0.82);
            if (previewImg && previewWrapper) {
              previewImg.src = window.loadedBase64Image;
              previewWrapper.classList.remove('hidden');
              previewWrapper.classList.add('flex');
            }
            if (urlInput) urlInput.value = '';
          };
          img.src = event.target.result;
        };
        reader.readAsDataURL(file);
      });
    }

    if (urlInput) {
      urlInput.addEventListener('input', () => {
        if (urlInput.value.trim() !== '') {
          window.loadedBase64Image = '';
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
      const particleCount = window.innerWidth < 768 ? 18 : 45;

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