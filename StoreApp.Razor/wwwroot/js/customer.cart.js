const CUSTOMER_CART_KEY = 'customer_cart';
const CUSTOMER_PRODUCT_API = '/api/Product';
const CUSTOMER_ORDER_API = '/api/Order';

let _cusCartCache = [];     

document.addEventListener('DOMContentLoaded', async () => {
    await cusCartLoad();
});

async function cusCartLoad() {
    showMsg('cartMsg', '');

    const cart = await cusCartReadFresh();
    _cusCartCache = cart;

    cusCartRender(cart);
    cusCartRenderSummary(cart);
}

function cusCartRead() {
    const raw = localStorage.getItem(CUSTOMER_CART_KEY);

    try {
        const cart = raw ? JSON.parse(raw) : [];
        return Array.isArray(cart) ? cart : [];
    } catch {
        return [];
    }
}

function cusCartReadLocal() {
    const raw = localStorage.getItem(CUSTOMER_CART_KEY);

    try {
        const cart = raw ? JSON.parse(raw) : [];
        return Array.isArray(cart) ? cart : [];
    } catch {
        return [];
    }
}

async function cusCartReadFresh() {
    const localCart = cusCartReadLocal();
    if (!localCart.length) return [];

    const freshCart = [];

    for (const item of localCart) {
        const result = await apiRequest('GET', `${CUSTOMER_PRODUCT_API}/${encodeURIComponent(item.productId)}`);

        if (!result.res || !result.res.ok || !result.data) continue;

        const p = result.data;
        const maxQuantity = Number(p.quantity || 0);

        freshCart.push({
            productId: p.id,
            productName: p.productName,
            price: Number(p.price || 0),
            imageUrl: p.imageUrl || '',
            quantity: Math.min(Math.max(Number(item.quantity || 1), 1), Math.max(maxQuantity, 1)),
            maxQuantity: maxQuantity
        });
    }

    cusCartSave(freshCart);
    return freshCart;
}

function cusCartSave(cart) {
    localStorage.setItem(CUSTOMER_CART_KEY, JSON.stringify(cart));
    _cusCartCache = cart;
}

function cusCartRender(cart) {
    const box = document.getElementById('cartList');
    if (!box) return;

    if (!cart.length) {
        box.innerHTML = `
            <div class="empty-box">
                Giỏ hàng đang trống.<br/>
                <a class="empty-link" href="/Customer">Quay lại trang sản phẩm</a>
            </div>
        `;
        return;
    }

    box.innerHTML = `
        <div class="cart-items">
            ${cart.map(item => `
                <div class="cart-item">
                    <div class="cart-item-image-wrap">
                        ${item.imageUrl
            ? `<img class="cart-item-image" src="${_escapeAttr(item.imageUrl)}" alt="${_escapeAttr(item.productName || '')}" />`
            : `<div class="cart-item-image placeholder">No image</div>`
        }
                    </div>

                    <div class="cart-item-info">
                        <div class="cart-item-name">${_escapeHtml(item.productName || '')}</div>
                        <div class="cart-item-price">Đơn giá: ${cusCartMoney(item.price)}</div>
                        <div class="cart-item-stock">Còn lại: ${Number(item.maxQuantity || 0)}</div>
                        <div class="cart-item-subtotal">Thành tiền: ${cusCartMoney(Number(item.price || 0) * Number(item.quantity || 0))}</div>
                    </div>

                    <div class="cart-item-actions">
                        <div class="qty-box">
                            <button type="button" class="qty-btn" onclick="cusCartDecrease('${_escapeAttr(item.productId)}')">−</button>
                            <span class="qty-value">${Number(item.quantity || 0)}</span>
                            <button type="button" class="qty-btn" onclick="cusCartIncrease('${_escapeAttr(item.productId)}')">+</button>
                        </div>

                        <button type="button" class="remove-btn" onclick="cusCartRemove('${_escapeAttr(item.productId)}')">
                            Xóa
                        </button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function cusCartRenderSummary(cart) {
    const itemKinds = document.getElementById('sumItemKinds');
    const quantity = document.getElementById('sumQuantity');
    const amount = document.getElementById('sumAmount');

    if (!itemKinds || !quantity || !amount) return;

    let totalQuantity = 0;
    let totalAmount = 0;

    for (const item of cart) {
        const q = Number(item.quantity || 0);
        const p = Number(item.price || 0);

        totalQuantity += q;
        totalAmount += q * p;
    }

    itemKinds.textContent = String(cart.length);
    quantity.textContent = String(totalQuantity);
    amount.textContent = cusCartMoney(totalAmount);
}

function cusCartIncrease(productId) {
    const cart = [..._cusCartCache];
    const item = cart.find(x => x.productId === productId);
    if (!item) return;

    const currentQty = Number(item.quantity || 1);
    const maxQty = Number(item.maxQuantity || 0);

    if (currentQty >= maxQty) {
        showMsg('cartMsg', 'Số lượng đã đạt tối đa tồn kho.', 'warn');
        setTimeout(() => showMsg('cartMsg', ''), 1800);
        return;
    }

    item.quantity = currentQty + 1;

    cusCartSave(cart);
    cusCartRender(cart);
    cusCartRenderSummary(cart);
}

function cusCartDecrease(productId) {
    const cart = [..._cusCartCache];
    const item = cart.find(x => x.productId === productId);
    if (!item) return;

    const currentQty = Number(item.quantity || 1);

    if (currentQty <= 1) {
        showMsg('cartMsg', 'Số lượng tối thiểu là 1.', 'warn');
        setTimeout(() => showMsg('cartMsg', ''), 1800);
        return;
    }

    item.quantity = currentQty - 1;

    cusCartSave(cart);
    cusCartRender(cart);
    cusCartRenderSummary(cart);
}

function cusCartRemove(productId) {
    const cart = [..._cusCartCache];
    const newCart = cart.filter(x => x.productId !== productId);

    cusCartSave(newCart);
    cusCartRender(newCart);
    cusCartRenderSummary(newCart);

    showMsg('cartMsg', 'Đã xóa sản phẩm khỏi giỏ hàng.', 'success');
    setTimeout(() => showMsg('cartMsg', ''), 1800);
}

function cusCartClear() {
    localStorage.removeItem(CUSTOMER_CART_KEY);
    _cusCartCache = [];

    cusCartRender([]);
    cusCartRenderSummary([]);

    showMsg('cartMsg', 'Đã xóa toàn bộ giỏ hàng.', 'success');
    setTimeout(() => showMsg('cartMsg', ''), 1800);
}

function cusCartMoney(v) {
    const n = Number(v || 0);
    return n.toLocaleString('vi-VN') + ' đ';
}

function _escapeHtml(s) {
    return String(s)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function _escapeAttr(s) {
    return _escapeHtml(s);
}

function cusGetCurrentCustomerId() {
    const token = getAccessToken();
    if (!token) return null;

    const payload = decodeJwtPayload(token);
    if (!payload) return null;

    return (
        payload["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"] ||
        payload.nameid ||
        payload.sub ||
        null
    );
}

async function cusCreateOrder() {
    showMsg('cartMsg', '');

    const cart = _cusCartCache || [];
    if (!cart.length) {
        showMsg('cartMsg', 'Giỏ hàng đang trống.', 'warn');
        setTimeout(() => showMsg('cartMsg', ''), 1800);
        return;
    }

    const address = document.getElementById('orderAddress')?.value?.trim() || '';
    if (!address) {
        showMsg('cartMsg', 'Vui lòng nhập địa chỉ giao hàng.', 'warn');
        setTimeout(() => showMsg('cartMsg', ''), 1800);
        return;
    }

    const paymentValue = document.getElementById('paymentMethod')?.value || '';
    if (paymentValue === '') {
        showMsg('cartMsg', 'Vui lòng chọn phương thức thanh toán.', 'warn');
        setTimeout(() => showMsg('cartMsg', ''), 1800);
        return;
    }

    const invalidQty = cart.find(x => {
        const qty = Number(x.quantity || 0);
        const maxQty = Number(x.maxQuantity || 0);
        return qty < 1 || qty > maxQty;
    });

    if (invalidQty) {
        showMsg('cartMsg', `Số lượng sản phẩm "${invalidQty.productName}" không hợp lệ.`, 'error');
        setTimeout(() => showMsg('cartMsg', ''), 1800);
        return;
    }

    const customerId = cusGetCurrentCustomerId();
    if (!customerId) {
        showMsg('cartMsg', 'Không lấy được thông tin khách hàng từ token.', 'error');
        setTimeout(() => showMsg('cartMsg', ''), 1800);
        return;
    }

    const body = {
        customerId: customerId,
        address: address,
        paymentMethod: Number(paymentValue),
        items: cart.map(x => ({
            productId: x.productId,
            quantity: Number(x.quantity || 0),
            price: Number(x.price || 0)
        }))
    };

    showMsg('cartMsg', 'Đang tạo đơn hàng...', 'warn');

    const result = await apiRequest('POST', CUSTOMER_ORDER_API, body);

    if (!result.res) {
        showMsg('cartMsg', result.raw || 'Không gọi được API tạo đơn hàng.', 'error');
        return;
    }

    if (!result.res.ok) {
        showMsg('cartMsg', result.data?.detail || result.data?.message || result.raw || `HTTP ${result.res.status}`, 'error');
        return;
    }

    localStorage.removeItem(CUSTOMER_CART_KEY);
    _cusCartCache = [];

    cusCartRender([]);
    cusCartRenderSummary([]);

    if (result.data?.paymentUrl) {
        showMsg('cartMsg', 'Tạo đơn hàng thành công. Đang chuyển sang VNPay...', 'success');
        setTimeout(() => {
            window.location.href = result.data.paymentUrl;
        }, 500);
        return;
    }

    showMsg('cartMsg', 'Đặt hàng thành công.', 'success');
    setTimeout(() => {
        window.location.href = '/customer/orders';
    }, 1000);
}