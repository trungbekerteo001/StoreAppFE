let _ordCache = [];
let _ordProdCache = [];
let _ordCurrent = null;

let _ordPageNumber = 1;
let _ordPageSize = 10;
let _ordTotalPages = 1;
let _ordTotalCount = 0;

const ORDER_API = '/api/Order';
const PROD_API = '/api/Product';

document.addEventListener('DOMContentLoaded', async () => {
    authGuard(['Staff', 'Admin']);
    await _ordLoadMeta();
    await ordLoad();
});

async function _ordLoadMeta() {
    const result = await apiRequest('GET', `${PROD_API}?PageSize=500`);
    _ordProdCache = (result?.res?.ok && Array.isArray(result.data)) ? result.data : [];
}

async function ordLoad(clearMsg = true) {
    if (clearMsg) showMsg('ordMsg', '');

    const tb = document.getElementById('ordTbody');
    if (tb) tb.innerHTML = `<tr><td colspan="9" class="muted">Đang tải...</td></tr>`;

    const qs = new URLSearchParams();
    qs.set('PageNumber', String(_ordPageNumber));
    qs.set('PageSize', String(_ordPageSize));

    const result = await apiRequest('GET', `${ORDER_API}?${qs.toString()}`);

    if (!result.res) {
        showMsg('ordMsg', result.raw || 'Không gọi được API.', 'error');
        if (tb) tb.innerHTML = `<tr><td colspan="9" class="muted">Lỗi tải dữ liệu.</td></tr>`;
        return;
    }

    if (!result.res.ok) {
        showMsg('ordMsg', result.data?.detail || result.data?.message || result.raw || `HTTP ${result.res.status}`, 'error');
        if (tb) tb.innerHTML = `<tr><td colspan="9" class="muted">Lỗi tải dữ liệu.</td></tr>`;
        return;
    }

    _ordCache = Array.isArray(result.data) ? result.data : [];

    const paginationRaw = result.res.headers.get('X-Pagination');
    if (paginationRaw) {
        try {
            const meta = JSON.parse(paginationRaw);
            _ordTotalPages = Math.max(1, Number(meta.TotalPages || 1));
            _ordPageNumber = Math.max(1, Number(meta.CurrentPage || _ordPageNumber));
            _ordTotalCount = Math.max(0, Number(meta.TotalCount || 0));
        } catch {
            _ordTotalPages = 1;
            _ordTotalCount = _ordCache.length;
        }
    } else {
        _ordTotalPages = 1;
        _ordTotalCount = _ordCache.length;
    }

    _renderOrdRows(_ordCache);
    _renderOrdPager();
}

function ordRefresh() {
    ordLoad();
}

function _renderOrdRows(items) {
    const tb = document.getElementById('ordTbody');
    if (!tb) return;

    if (!items || items.length === 0) {
        tb.innerHTML = `<tr><td colspan="9" class="muted">Không có dữ liệu.</td></tr>`;
        return;
    }

    tb.innerHTML = items.map((x, idx) => {
        const id = String(x.id || '');
        const statusKey = _statusKey(x.orderStatus);

        const paymentKey = String(x.paymentMethod ?? '').trim().toLowerCase();
        const isCash = paymentKey === '0' || paymentKey === 'cash';
        const isVnPay = paymentKey === '1' || paymentKey === 'vnpay';

        const canConfirm = (isCash && statusKey === 'pending') || (isVnPay && statusKey === 'paid');
        const canDeliver = statusKey === 'confirmed';
        const canCancel = (isCash && statusKey === 'pending') || (isVnPay && statusKey === 'paid');

        const rowNo = ((_ordPageNumber - 1) * _ordPageSize) + idx + 1;
        const itemCount = Array.isArray(x.items) ? x.items.length : 0;

        return `
            <tr>
                <td>${rowNo}</td>
                <td>
                    <div class="cell-main">${_esc(_shortId(id, 10))}</div>
                    <div class="cell-sub">${_esc(id)}</div>
                </td>
                <td>${_esc(_shortId(x.customerId, 10))}</td>
                <td>${_esc(_paymentText(x.paymentMethod))}</td>
                <td><span class="status-badge ${_statusClass(x.orderStatus)}">${_esc(_statusText(x.orderStatus))}</span></td>
                <td>${itemCount}</td>
                <td>${_esc(_fmtMoney(x.totalAmount))}</td>
                <td>${_esc(_fmtDateTime(x.updatedAt))}</td>
                <td>
                    <div class="row-actions">
                        <button class="btn" type="button" onclick="ordOpenView('${_escAttr(id)}')">Xem</button>
                        ${canConfirm ? `<button class="btn primary" type="button" onclick="ordConfirm('${_escAttr(id)}')">Xác nhận</button>` : ''}
                        ${canDeliver ? `<button class="btn primary" type="button" onclick="ordDeliver('${_escAttr(id)}')">Giao hàng</button>` : ''}
                        ${canCancel ? `<button class="btn danger" type="button" onclick="ordCancel('${_escAttr(id)}')">Huỷ</button>` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

async function ordOpenView(id) {
    showMsg('ordModalMsg', '');

    const result = await apiRequest('GET', `${ORDER_API}/${encodeURIComponent(id)}`);
    if (!result.res) {
        showMsg('ordMsg', result.raw || 'Không gọi được API.', 'error');
        return;
    }

    if (!result.res.ok) {
        showMsg('ordMsg', result.data?.detail || result.data?.message || result.raw || `HTTP ${result.res.status}`, 'error');
        return;
    }

    _ordCurrent = result.data || null;
    _renderOrdModal(_ordCurrent);
    _ordOpenModal();
}

function _renderOrdModal(order) {
    if (!order) return;

    _setText('ordViewId', order.id || '');
    _setText('ordViewCustomerId', order.customerId || '');
    _setText('ordViewStaffId', order.staffId || '—');
    _setText('ordViewPayment', _paymentText(order.paymentMethod));
    _setText('ordViewStatus', _statusText(order.orderStatus));
    _setText('ordViewUpdatedAt', _fmtDateTime(order.updatedAt));
    _setText('ordViewTotal', _fmtMoney(order.totalAmount));
    _setText('ordViewAddress', order.address || '—');

    const body = document.getElementById('ordItemsTbody');
    const items = Array.isArray(order.items) ? order.items : [];

    if (body) {
        if (items.length === 0) {
            body.innerHTML = `<tr><td colspan="5" class="muted">Không có chi tiết đơn hàng.</td></tr>`;
        } else {
            body.innerHTML = items.map((x, idx) => {
                const productName = _productName(x.productId);

                return `
                    <tr>
                        <td>${idx + 1}</td>
                        <td>
                            <div class="cell-main">${_esc(productName)}</div>
                            <div class="cell-sub">${_esc(x.productId || '')}</div>
                        </td>
                        <td>${Number(x.quantity || 0)}</td>
                        <td>${_esc(_fmtMoney(x.price))}</td>
                        <td>${_esc(_fmtMoney(x.totalPrice))}</td>
                    </tr>
                `;
            }).join('');
        }
    }

    _renderOrdModalActions(order);
}

function _renderOrdModalActions(order) {
    const statusKey = _statusKey(order?.orderStatus);

    const paymentKey = String(order?.paymentMethod ?? '').trim().toLowerCase();
    const isCash = paymentKey === '0' || paymentKey === 'cash';
    const isVnPay = paymentKey === '1' || paymentKey === 'vnpay';

    _toggleActionBtn('ordConfirmBtn', (isCash && statusKey === 'pending') || (isVnPay && statusKey === 'paid'));
    _toggleActionBtn('ordDeliverBtn', statusKey === 'confirmed');
    _toggleActionBtn('ordCancelBtn', (isCash && statusKey === 'pending') || (isVnPay && statusKey === 'paid'));
}

function _toggleActionBtn(id, visible) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.style.display = visible ? 'inline-flex' : 'none';
}

async function ordConfirm(id) {
    await _ordRunActionById(id, 'confirm', 'Xác nhận đơn hàng thành công.', 'xác nhận');
}

async function ordDeliver(id) {
    await _ordRunActionById(id, 'deliver', 'Chuyển trạng thái giao hàng thành công.', 'giao hàng');
}

async function ordCancel(id) {
    await _ordRunActionById(id, 'cancel', 'Huỷ đơn hàng thành công.', 'huỷ');
}

async function ordConfirmCurrent() {
    if (_ordCurrent?.id) await ordConfirm(_ordCurrent.id);
}

async function ordDeliverCurrent() {
    if (_ordCurrent?.id) await ordDeliver(_ordCurrent.id);
}

async function ordCancelCurrent() {
    if (_ordCurrent?.id) await ordCancel(_ordCurrent.id);
}

async function _ordRunActionById(id, action, successText, actionLabel) {
    if (!id) return;
    if (!confirm(`Bạn chắc chắn muốn ${actionLabel} đơn hàng này?`)) return;

    _setActionBusy(true);
    showMsg('ordModalMsg', '');

    const result = await apiRequest('PUT', `${ORDER_API}/${encodeURIComponent(id)}/${action}`);

    _setActionBusy(false);

    if (!result.res) {
        showMsg('ordModalMsg', result.raw || 'Không gọi được API.', 'error');
        return;
    }

    if (!result.res.ok) {
        showMsg('ordModalMsg', result.data?.detail || result.data?.message || result.raw || `HTTP ${result.res.status}`, 'error');
        return;
    }

    await ordLoad(false);

    if (_ordCurrent && String(_ordCurrent.id).toLowerCase() === String(id).toLowerCase()) {
        const fresh = await apiRequest('GET', `${ORDER_API}/${encodeURIComponent(id)}`);
        if (fresh?.res?.ok) {
            _ordCurrent = fresh.data;
            _renderOrdModal(_ordCurrent);
        }
    }

    showMsg('ordMsg', successText, 'success');
    showMsg('ordModalMsg', successText, 'success');
    setTimeout(() => showMsg('ordMsg', ''), 1800);
}

function _setActionBusy(disabled) {
    ['ordConfirmBtn', 'ordDeliverBtn', 'ordCancelBtn'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.disabled = !!disabled;
    });
}

function _productName(id) {
    const item = _ordProdCache.find(x => String(x.id).toLowerCase() === String(id).toLowerCase());
    return item?.productName || _shortId(id, 12);
}

function _statusKey(v) {
    const s = String(v ?? '').trim().toLowerCase();

    if (s === '0' || s === 'pending') return 'pending';
    if (s === '1' || s === 'paid') return 'paid';
    if (s === '2' || s === 'confirmed') return 'confirmed';
    if (s === '3' || s === 'delivered') return 'delivered';
    if (s === '4' || s === 'canceled' || s === 'cancelled') return 'canceled';

    return 'pending';
}

function _statusText(v) {
    const s = _statusKey(v);
    if (s === 'pending') return 'Pending';
    if (s === 'paid') return 'Paid';
    if (s === 'confirmed') return 'Confirmed';
    if (s === 'delivered') return 'Delivered';
    if (s === 'canceled') return 'Canceled';
    return 'Pending';
}

function _statusClass(v) {
    return _statusKey(v);
}

function _paymentText(v) {
    const s = String(v ?? '').trim().toLowerCase();
    if (s === '1' || s === 'vnpay') return 'VnPay';
    return 'Cash';
}

function _fmtMoney(v) {
    const n = Number(v || 0);
    if (!isFinite(n)) return String(v ?? '0');
    return `${n.toLocaleString('vi-VN')} ₫`;
}

function _fmtDateTime(v) {
    if (!v) return '—';

    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);

    return d.toLocaleString('vi-VN');
}

function _shortId(v, len = 8) {
    const s = String(v || '');
    return s.length > len ? `${s.slice(0, len)}...` : s;
}

function _setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text ?? '';
}

function _ordOpenModal() {
    const m = document.getElementById('ordModal');
    if (m) m.classList.add('show');
}

function ordCloseModal() {
    const m = document.getElementById('ordModal');
    if (m) m.classList.remove('show');
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') ordCloseModal();
});

function _renderOrdPager() {
    const info = document.getElementById('ordPagerInfo');
    const prevBtn = document.getElementById('ordPrevBtn');
    const nextBtn = document.getElementById('ordNextBtn');

    if (info) {
        const from = _ordTotalCount === 0 ? 0 : ((_ordPageNumber - 1) * _ordPageSize) + 1;
        const to = Math.min(_ordPageNumber * _ordPageSize, _ordTotalCount);
        info.textContent = `Trang ${_ordPageNumber} / ${_ordTotalPages} • ${from}-${to} / ${_ordTotalCount}`;
    }

    if (prevBtn) prevBtn.disabled = _ordPageNumber <= 1;
    if (nextBtn) nextBtn.disabled = _ordPageNumber >= _ordTotalPages;
}

function ordPrevPage() {
    if (_ordPageNumber <= 1) return;
    _ordPageNumber--;
    ordLoad(false);
}

function ordNextPage() {
    if (_ordPageNumber >= _ordTotalPages) return;
    _ordPageNumber++;
    ordLoad(false);
}

function _esc(s) {
    return String(s ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function _escAttr(s) {
    return String(s ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
}