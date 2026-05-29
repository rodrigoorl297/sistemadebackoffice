/* SOU + BLU – Loja de Prêmios (employee + painel admin) */

const StoreShop = {
  cart: {},
  activeCategory: 'Todos',
  currentModalProduct: null,
  modalQty: 1,

  async ensureUser() {
    if (typeof currentUser !== 'undefined' && currentUser?.id) return currentUser;
    if (window.__PREVIEW_USER_ID__ && typeof DB !== 'undefined') {
      currentUser = await DB.getUser(window.__PREVIEW_USER_ID__);
      return currentUser;
    }
    if (typeof resolveEmployeeUser === 'function') {
      currentUser = await resolveEmployeeUser();
      return currentUser;
    }
    if (typeof Auth !== 'undefined') {
      currentUser = await Auth.getCurrentUser();
    }
    return currentUser || null;
  },

  productPointsPrice(p) {
    return parseFloat(p?.points_price ?? p?.price ?? 0) || 0;
  },

  async renderBalance() {
    const u = await this.ensureUser();
    if (!u) return;
    const uid = window.__PREVIEW_USER_ID__ || u.id;
    const fresh = uid ? await DB.getUser(uid).catch(() => null) : null;
    if (fresh) currentUser = fresh;
    const pts = typeof userPts === 'function' ? userPts(currentUser) : (currentUser?.points || currentUser?.balance || 0);
    const banner = document.getElementById('bannerPoints');
    const topbar = document.getElementById('topbarPoints');
    if (banner) banner.textContent = typeof formatCurrency === 'function' ? formatCurrency(pts, currentUser) : `${pts} pts`;
    if (topbar) topbar.textContent = typeof formatCurrency === 'function' ? formatCurrency(pts, currentUser) : `${pts} pts`;
  },

  async renderCategories() {
    const el = document.getElementById('categoryFilter');
    if (!el) return;
    const prods = await DB.getCatalogProducts().catch(() => []);
    const active = (prods || []).filter(p => p.active && p.stock > 0);
    const cats = ['Todos', ...new Set(active.map(p => p.category))];
    el.innerHTML = cats.map(c =>
      `<button type="button" class="filter-chip ${c === this.activeCategory ? 'active' : ''}" onclick="setCategory('${String(c).replace(/'/g, "\\'")}',this)">${c}</button>`
    ).join('');
  },

  setCategory(cat, el) {
    this.activeCategory = cat;
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    if (el) el.classList.add('active');
    this.renderProducts();
  },

  filterProducts() {
    this.renderProducts();
  },

  async renderProducts() {
    const grid = document.getElementById('productGrid');
    if (!grid) return;
    const u = await this.ensureUser();
    const q = (document.getElementById('storeSearch')?.value || '').toLowerCase();
    let prods = (await DB.getCatalogProducts().catch(() => [])).filter(p => p.active && p.stock > 0);
    if (this.activeCategory !== 'Todos') prods = prods.filter(p => p.category === this.activeCategory);
    if (q) prods = prods.filter(p =>
      (p.name || '').toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q)
    );

    if (!prods.length) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><h4>Nenhum produto encontrado</h4></div>';
      return;
    }

    const ptsBal = u && typeof userPts === 'function' ? userPts(u) : (u?.points || u?.balance || 0);
    grid.innerHTML = prods.map(p => {
      const pts = this.productPointsPrice(p);
      const canBuy = ptsBal >= pts;
      const inCart = this.cart[p.id]?.qty || 0;
      const safeId = String(p.id).replace(/'/g, "\\'");
      return `
      <div class="product-card" onclick="openProductModal('${safeId}')">
        <div class="product-img-wrap">${typeof productThumb === 'function' ? productThumb(p) : ''}</div>
        <div class="product-info">
          <span class="product-category">${p.category || ''}</span>
          <div class="product-name">${p.name || ''}</div>
          <div class="product-price-row">
            <div class="product-price">${typeof formatCurrency === 'function' ? formatCurrency(pts) : pts}</div>
            <span class="product-stock">${p.stock} un.</span>
          </div>
        </div>
        <button type="button" class="btn ${canBuy ? 'btn-primary' : 'btn-ghost'} btn-buy"
          onclick="event.stopPropagation();quickAddToCart('${safeId}')" ${!canBuy ? 'disabled' : ''}>
          ${inCart > 0 ? `Carrinho (${inCart})` : canBuy ? 'Adicionar' : 'Pontos insuficientes'}
        </button>
      </div>`;
    }).join('');
  },

  async openProductModal(pid) {
    const p = await DB.getProduct(pid);
    if (!p) return;
    const u = await this.ensureUser();
    const pts = this.productPointsPrice(p);
    this.currentModalProduct = { ...p, points_price: pts };
    this.modalQty = 1;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('prodModalName', p.name || '');
    set('prodModalCategory', p.category || '');
    set('prodModalDesc', p.description || 'Sem descrição.');
    set('prodModalPrice', typeof formatCurrency === 'function' ? formatCurrency(pts) : String(pts));
    set('prodModalStock', `${p.stock} unidade(s)`);
    set('modalQty', '1');
    const img = document.getElementById('prodModalImg');
    if (img) img.innerHTML = typeof productThumb === 'function' ? productThumb(p) : '';
    const btn = document.getElementById('addToCartBtn');
    if (btn) {
      const bal = u && typeof userPts === 'function' ? userPts(u) : 0;
      btn.disabled = bal < pts;
      btn.onclick = () => { this.addToCart(p.id, this.modalQty); if (typeof closeModal === 'function') closeModal('productModal'); };
    }
    if (typeof openModal === 'function') openModal('productModal');
  },

  changeModalQty(d) {
    if (!this.currentModalProduct) return;
    this.modalQty = Math.max(1, Math.min(this.currentModalProduct.stock, this.modalQty + d));
    const el = document.getElementById('modalQty');
    if (el) el.textContent = String(this.modalQty);
    const btn = document.getElementById('addToCartBtn');
    if (btn) {
      const u = currentUser;
      const bal = u && typeof userPts === 'function' ? userPts(u) : 0;
      btn.disabled = bal < this.productPointsPrice(this.currentModalProduct) * this.modalQty;
    }
  },

  async quickAddToCart(pid) {
    await this.addToCart(pid, 1);
  },

  async addToCart(pid, qty = 1) {
    const u = await this.ensureUser();
    if (!u) { if (typeof showToast === 'function') showToast('Sessão inválida.', 'error'); return; }
    const p = await DB.getProduct(pid);
    if (!p || p.stock < qty) { if (typeof showToast === 'function') showToast('Estoque insuficiente.', 'error'); return; }
    const pts = this.productPointsPrice(p);
    if (this.cart[pid]) this.cart[pid].qty = Math.min(p.stock, this.cart[pid].qty + qty);
    else this.cart[pid] = { ...p, points_price: pts, qty };
    const total = Object.values(this.cart).reduce((s, i) => s + i.qty, 0);
    if (typeof updateCartBadge === 'function') updateCartBadge(total);
    const cc = document.getElementById('cartCount');
    if (cc) cc.textContent = `(${total})`;
    await this.renderProducts();
    if (typeof showToast === 'function') showToast(`${p.name} adicionado!`, 'success');
  },

  removeFromCart(pid) {
    delete this.cart[pid];
    this.renderCartItems();
    this.renderProducts();
  },

  changeCartQty(pid, d) {
    if (!this.cart[pid]) return;
    const nq = this.cart[pid].qty + d;
    if (nq <= 0) { this.removeFromCart(pid); return; }
    this.cart[pid].qty = Math.min(99, nq);
    this.renderCartItems();
  },

  openCart() {
    this.renderCartItems();
    if (typeof openModal === 'function') openModal('cartModal');
  },

  renderCartItems() {
    const items = Object.values(this.cart);
    const total = parseFloat(items.reduce((s, i) => s + this.productPointsPrice(i) * i.qty, 0).toFixed(2));
    const u = currentUser;
    const bal = u && typeof userPts === 'function' ? userPts(u) : (u?.points ?? u?.balance ?? 0);
    const box = document.getElementById('cartItems');
    const totalEl = document.getElementById('cartTotal');
    const balEl = document.getElementById('cartBalanceInfo');
    const checkoutBtn = document.getElementById('checkoutBtn');
    if (!box) return;
    if (!items.length) {
      box.innerHTML = '<div class="empty-state"><h4>Carrinho vazio</h4></div>';
      if (totalEl) totalEl.textContent = typeof formatCurrency === 'function' ? formatCurrency(0) : '0';
      if (checkoutBtn) checkoutBtn.disabled = true;
      return;
    }
    box.innerHTML = items.map(i => {
      const safeId = String(i.id).replace(/'/g, "\\'");
      return `
      <div class="cart-item">
        <div class="cart-item-img">${typeof productThumb === 'function' ? productThumb(i) : ''}</div>
        <div class="cart-item-info"><div class="cart-item-name">${i.name}</div>
          <div class="cart-item-price">${typeof formatCurrency === 'function' ? formatCurrency(this.productPointsPrice(i) * i.qty) : ''}</div></div>
        <div class="cart-qty"><button type="button" onclick="changeCartQty('${safeId}',-1)">−</button><span>${i.qty}</span><button type="button" onclick="changeCartQty('${safeId}',1)">+</button></div>
        <button type="button" class="btn-icon" onclick="removeFromCart('${safeId}')" title="Remover">×</button>
      </div>`;
    }).join('');
    if (totalEl) totalEl.textContent = typeof formatCurrency === 'function' ? formatCurrency(total) : String(total);
    if (balEl) {
      const fmt = typeof formatCurrency === 'function' ? formatCurrency : (v) => String(v);
      balEl.textContent = `Saldo: ${fmt(bal)} → Após: ${fmt(bal - total)}`;
    }
    if (checkoutBtn) checkoutBtn.disabled = bal < total;
  },

  async checkout() {
    const u = await this.ensureUser();
    if (!u) { if (typeof showToast === 'function') showToast('Sessão inválida.', 'error'); return; }
    const items = Object.values(this.cart).map(i => ({
      productId: i.id, qty: i.qty, price: i.price || 0,
      points_price: i.points_price || i.price || 0, name: i.name,
      emoji: i.emoji || '', image_url: i.image_url || '',
    }));
    if (!items.length) { if (typeof showToast === 'function') showToast('Carrinho vazio!', 'warning'); return; }
    if (typeof showLoading === 'function') showLoading('Processando pedido...');
    try {
      const r = await DB.placeOrder(u.id, items);
      if (!r?.ok) {
        if (typeof showToast === 'function') showToast(r?.msg || 'Não foi possível finalizar a compra.', 'error');
        return;
      }
      this.cart = {};
      if (typeof updateCartBadge === 'function') updateCartBadge(0);
      const cc = document.getElementById('cartCount');
      if (cc) cc.textContent = '(0)';
      if (typeof closeModal === 'function') closeModal('cartModal');
      const fresh = await DB.getUser(u.id).catch(() => null);
      if (fresh) currentUser = fresh;
      await this.renderBalance();
      await this.renderProducts();
      if (!window.SOUBLU_ADMIN_PROFILE && typeof renderOrders === 'function') await renderOrders();
      if (typeof showToast === 'function') showToast('Pedido realizado!', 'success');
      if (window.SOUBLU_ADMIN_PROFILE) {
        if (typeof renderAdminPrizeStore === 'function') await renderAdminPrizeStore();
        else if (typeof navigateTo === 'function') navigateTo('secStore');
      } else if (typeof navigateTo === 'function') {
        navigateTo('secOrders');
      }
    } catch (err) {
      console.error('[checkout]', err);
      if (typeof showToast === 'function') showToast(err.message || 'Erro ao finalizar compra.', 'error');
    } finally {
      if (typeof hideLoading === 'function') hideLoading();
    }
  },

  async init() {
    await Promise.all([
      this.renderBalance(),
      this.renderCategories(),
      this.renderProducts(),
    ]);
  },
};

/* Globals usados no HTML (onclick / oninput) */
function filterProducts() { return StoreShop.filterProducts(); }
function setCategory(cat, el) { return StoreShop.setCategory(cat, el); }
function openProductModal(pid) { return StoreShop.openProductModal(pid); }
function changeModalQty(d) { return StoreShop.changeModalQty(d); }
function quickAddToCart(pid) { return StoreShop.quickAddToCart(pid); }
function openCart() { return StoreShop.openCart(); }
function changeCartQty(pid, d) { return StoreShop.changeCartQty(pid, d); }
function removeFromCart(pid) { return StoreShop.removeFromCart(pid); }
async function checkout() { return StoreShop.checkout(); }
async function renderBalance() { return StoreShop.renderBalance(); }
async function renderCategories() { return StoreShop.renderCategories(); }
async function renderProducts() { return StoreShop.renderProducts(); }

window.StoreShop = StoreShop;
