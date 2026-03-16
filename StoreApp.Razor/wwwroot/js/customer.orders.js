const CUSTOMER_ORDER_API = '/api/Order';
const CUSTOMER_PRODUCT_API = '/api/Product';

let _cusOrdCache = [];
let _cusOrdProductCache = [];
let _cusOrdCurrent = null;

let _cusOrdPageNumber = 1;
let _cusOrdPageSize = 10;
let _cusOrdTotalPages = 1;
let _cusOrdTotalCount = 0;

document.addEventListener('DOMContentLoaded', async () => {
    await cusOrdLoadProducts();
    await cusOrdLoad();
});

async function cusOrdLoadProducts() {
    const result = await apiRequest('GET', `${CUSTOMER_PRODUCT_API}?PageNumber=1&PageSize=100`);
    _cusOrdProductCache = (result?.res?.ok && Array.isArray(result.data)) ? result.data : [];
}

async function cusOrdLoad(clearMsg = true) {
    if (clearMsg) showMsg('cusOrdMsg', '');

    const tb = document.getElementById('cusOrdTbody');
    if (tb) tb.innerHTML = `<tr><td colspan="8" class="muted">Đang tải...</td></tr>`;

    const qs = new URLSearchParams();
    qs.set('PageNumber', String(_cusOrdPageNumber));
    qs.set('PageSize', String(_cusOrdPageSize));

    const result = await apiRequest('GET', `${CUSTOMER_ORDER_API}?${qs.toString()}`);

    if (!result.res) {
        showMsg('cusOrdMsg', result.raw || 'Không gọi được API lịch sử đơn hàng.', 'error');
        if (tb) tb.innerHTML = `<tr><td colspan="8" class="muted">Lỗi tải dữ liệu.</td></tr>`;
        return;
    }

    if (!result.res.ok) {
        showMsg('cusOrdMsg', result.data?.detail || result.data?.message || result.raw || `HTTP ${result.res.status}`, 'error');
        if (tb) tb.innerHTML = `<tr><td colspan="8" class="muted">Lỗi tải dữ liệu.</td></tr>`;
        return;
    }

    _cusOrdCache = Array.isArray(result.data) ? result.data : [];

    const paginationRaw = result.res.headers.get('X-Pagination');
    if (paginationRaw) {
        try {
            const meta = JSON.parse(paginationRaw);
            _cusOrdTotalPages = Math.max(1, Number(meta.TotalPages || 1));
            _cusOrdPageNumber = Math.max(1, Number(meta.CurrentPage || _cusOrdPageNumber));
            _cusOrdTotalCount = Math.max(0, Number(meta.TotalCount || 0));
        } catch {
            _cusOrdTotalPages = 1;
            _cusOrdTotalCount = _cusOrdCache.length;
        }
    } else {
        _cusOrdTotalPages = 1;
        _cusOrdTotalCount = _cusOrdCache.length;
    }

    cusOrdRenderRows(_cusOrdCache);
    cusOrdRenderPager();
}

function cusOrdReload() {
    cusOrdLoad();
}

function cusOrdRenderRows(items) {
    const tb = document.getElementById('cusOrdTbody');
    if (!tb) return;

    if (!items || items.length === 0) {
        tb.innerHTML = `<tr><td colspan="8" class="muted">Bạn chưa có đơn hàng nào.</td></tr>`;
        return;
    }

    tb.innerHTML = items.map((x, idx) => {
        const id = String(x.id || '');
        const rowNo = ((_cusOrdPageNumber - 1) * _cusOrdPageSize) + idx + 1;
        const itemCount = Array.isArray(x.items) ? x.items.length : 0;

        const statusKey = cusOrdStatusKey(x.orderStatus);
        const paymentKey = String(x.paymentMethod ?? '').trim().toLowerCase();
        const isCash = paymentKey === '0' || paymentKey === 'cash';
        const isVnPay = paymentKey === '1' || paymentKey === 'vnpay';
        const canCancel = (isCash && statusKey === 'pending') || (isVnPay && statusKey === 'pending');

        return `
            <tr>
                <td>${rowNo}</td>
                <td>
                    <div class="cell-main">${cusOrdEsc(cusOrdShortId(id, 12))}</div>
                    <div class="cell-sub">${cusOrdEsc(id)}</div>
                </td>
                <td>${cusOrdEsc(cusOrdPaymentText(x.paymentMethod))}</td>
                <td><span class="status-badge ${cusOrdStatusClass(x.orderStatus)}">${cusOrdEsc(cusOrdStatusText(x.orderStatus))}</span></td>
                <td>${itemCount}</td>
                <td>${cusOrdEsc(cusOrdMoney(x.totalAmount))}</td>
                <td>${cusOrdEsc(cusOrdDateTime(x.updatedAt))}</td>
                

                <td>
                    <button class="btn" type="button" onclick="cusOrdOpenView('${cusOrdEscAttr(id)}')">Xem</button>
                    ${canCancel ? `<button class="btn danger" type="button" onclick="cusOrdCancel('${cusOrdEscAttr(id)}')">Huỷ</button>` : ''}
                </td>
            </tr>
        `;
    }).join('');
}

async function cusOrdOpenView(id) {
    showMsg('cusOrdModalMsg', '');

    const result = await apiRequest('GET', `${CUSTOMER_ORDER_API}/${encodeURIComponent(id)}`);
    if (!result.res) {
        showMsg('cusOrdMsg', result.raw || 'Không gọi được API chi tiết đơn hàng.', 'error');
        return;
    }

    if (!result.res.ok) {
        showMsg('cusOrdMsg', result.data?.detail || result.data?.message || result.raw || `HTTP ${result.res.status}`, 'error');
        return;
    }

    _cusOrdCurrent = result.data || null;
    cusOrdRenderModal(_cusOrdCurrent);
    cusOrdShowModal();
}

function cusOrdRenderModal(order) {
    if (!order) return;

    cusOrdSetText('cusOrdViewId', order.id || '');
    cusOrdSetText('cusOrdViewPayment', cusOrdPaymentText(order.paymentMethod));
    cusOrdSetText('cusOrdViewStatus', cusOrdStatusText(order.orderStatus));
    cusOrdSetText('cusOrdViewStaffId', order.staffId || '—');
    cusOrdSetText('cusOrdViewUpdatedAt', cusOrdDateTime(order.updatedAt));
    cusOrdSetText('cusOrdViewAddress', order.address || '—');
    cusOrdSetText('cusOrdViewTotal', cusOrdMoney(order.totalAmount));

    const body = document.getElementById('cusOrdItemsTbody');
    const items = Array.isArray(order.items) ? order.items : [];

    if (!body) return;

    if (!items.length) {
        body.innerHTML = `<tr><td colspan="5" class="muted">Không có chi tiết đơn hàng.</td></tr>`;
        return;
    }

    body.innerHTML = items.map((x, idx) => `
        <tr>
            <td>${idx + 1}</td>
            <td>
                <div class="cell-main">${cusOrdEsc(cusOrdProductName(x.productId))}</div>
                <div class="cell-sub">${cusOrdEsc(x.productId || '')}</div>
            </td>
            <td>${Number(x.quantity || 0)}</td>
            <td>${cusOrdEsc(cusOrdMoney(x.price))}</td>
            <td>${cusOrdEsc(cusOrdMoney(x.totalPrice))}</td>
        </tr>
    `).join('');
}

function cusOrdProductName(id) {
    const item = _cusOrdProductCache.find(x => String(x.id).toLowerCase() === String(id).toLowerCase());
    return item?.productName || cusOrdShortId(id, 12);
}

function cusOrdStatusKey(v) {
    const s = String(v ?? '').trim().toLowerCase();

    if (s === '0' || s === 'pending') return 'pending';
    if (s === '1' || s === 'paid') return 'paid';
    if (s === '2' || s === 'confirmed') return 'confirmed';
    if (s === '3' || s === 'delivered') return 'delivered';
    if (s === '4' || s === 'canceled' || s === 'cancelled') return 'canceled';

    return 'pending';
}

function cusOrdStatusText(v) {
    const s = cusOrdStatusKey(v);
    if (s === 'pending') return 'Pending';
    if (s === 'paid') return 'Paid';
    if (s === 'confirmed') return 'Confirmed';
    if (s === 'delivered') return 'Delivered';
    if (s === 'canceled') return 'Canceled';
    return 'Pending';
}

function cusOrdStatusClass(v) {
    return cusOrdStatusKey(v);
}

function cusOrdPaymentText(v) {
    const s = String(v ?? '').trim().toLowerCase();
    if (s === '1' || s === 'vnpay') return 'VnPay';
    return 'Cash';
}

function cusOrdMoney(v) {
    const n = Number(v || 0);
    if (!isFinite(n)) return String(v ?? '0');
    return `${n.toLocaleString('vi-VN')} ₫`;
}

function cusOrdDateTime(v) {
    if (!v) return '—';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleString('vi-VN');
}

function cusOrdShortId(v, len = 8) {
    const s = String(v || '');
    return s.length > len ? `${s.slice(0, len)}...` : s;
}

function cusOrdSetText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text ?? '';
}

function cusOrdShowModal() {
    const m = document.getElementById('cusOrdModal');
    if (m) m.classList.add('show');
}

function cusOrdCloseModal() {
    const m = document.getElementById('cusOrdModal');
    if (m) m.classList.remove('show');
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cusOrdCloseModal();
});

function cusOrdRenderPager() {
    const info = document.getElementById('cusOrdPagerInfo');
    const prevBtn = document.getElementById('cusOrdPrevBtn');
    const nextBtn = document.getElementById('cusOrdNextBtn');

    if (info) {
        const from = _cusOrdTotalCount === 0 ? 0 : ((_cusOrdPageNumber - 1) * _cusOrdPageSize) + 1;
        const to = Math.min(_cusOrdPageNumber * _cusOrdPageSize, _cusOrdTotalCount);
        info.textContent = `Trang ${_cusOrdPageNumber} / ${_cusOrdTotalPages} • ${from}-${to} / ${_cusOrdTotalCount}`;
    }

    if (prevBtn) prevBtn.disabled = _cusOrdPageNumber <= 1;
    if (nextBtn) nextBtn.disabled = _cusOrdPageNumber >= _cusOrdTotalPages;
}

function cusOrdPrevPage() {
    if (_cusOrdPageNumber <= 1) return;
    _cusOrdPageNumber--;
    cusOrdLoad(false);
}

function cusOrdNextPage() {
    if (_cusOrdPageNumber >= _cusOrdTotalPages) return;
    _cusOrdPageNumber++;
    cusOrdLoad(false);
}

function cusOrdEsc(s) {
    return String(s ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function cusOrdEscAttr(s) {
    return cusOrdEsc(s);
}

async function cusOrdCancel(id) {
    if (!id) return;
    if (!confirm('Bạn chắc chắn muốn huỷ đơn hàng này?')) return;

    showMsg('cusOrdMsg', '');

    const result = await apiRequest('PUT', `${CUSTOMER_ORDER_API}/${encodeURIComponent(id)}/cancel`);

    if (!result.res) {
        showMsg('cusOrdMsg', result.raw || 'Không gọi được API huỷ đơn hàng.', 'error');
        return;
    }

    if (!result.res.ok) {
        showMsg('cusOrdMsg', result.data?.detail || result.data?.message || result.raw || `HTTP ${result.res.status}`, 'error');
        return;
    }

    showMsg('cusOrdMsg', 'Huỷ đơn hàng thành công.', 'success');
    await cusOrdLoad(false);

    if (_cusOrdCurrent && String(_cusOrdCurrent.id).toLowerCase() === String(id).toLowerCase()) {
        cusOrdCloseModal();
    }

    setTimeout(() => showMsg('cusOrdMsg', ''), 1800);
}