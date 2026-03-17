window.StoreApp = window.StoreApp || {};
window.StoreApp.pages = window.StoreApp.pages || {};

StoreApp.pages.customerOrders = (() => {
    const dom = StoreApp.dom;
    const http = StoreApp.http;
    const role = StoreApp.role;
    const auth = StoreApp.auth;
    const msg = StoreApp.message;
    const pager = StoreApp.pager;

    const API = {
        order: "/api/Order",
        product: "/api/Product"
    };

    const state = {
        items: [],
        current: null,
        productCache: [],

        pageNumber: 1,
        pageSize: 10,
        totalPages: 1,
        totalCount: 0
    };

    document.addEventListener("DOMContentLoaded", initPage);

    async function initPage() {
        if (!role.guard(["Customer"])) return;

        bindEvents();
        await loadProducts();
        await loadOrders();
    }

    function bindEvents() {
        dom.byId("cusOrdPrevBtn")?.addEventListener("click", prevPage);
        dom.byId("cusOrdNextBtn")?.addEventListener("click", nextPage);

        dom.byId("btnCusOrdCloseX")?.addEventListener("click", closeModal);
        dom.byId("btnCusOrdClose")?.addEventListener("click", closeModal);
        dom.byId("cusOrdBackdrop")?.addEventListener("click", closeModal);

        dom.byId("btnCusOrdCancel")?.addEventListener("click", cancelCurrentOrder);

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") closeModal();
        });
    }

    async function loadProducts() {
        const result = await http.request("GET", `${API.product}?PageNumber=1&PageSize=500`);
        state.productCache = (result?.res?.ok && Array.isArray(result.data)) ? result.data : [];
    }

    async function loadOrders(clearMessage = true) {
        if (clearMessage) msg.show("cusOrdMsg", "");

        const tb = dom.byId("cusOrdTbody");

        if (tb) {
            tb.innerHTML = `<tr><td colspan="8" class="muted">Đang tải...</td></tr>`;
        }

        const qs = new URLSearchParams();
        qs.set("PageNumber", String(state.pageNumber));
        qs.set("PageSize", String(state.pageSize));

        const result = await http.request("GET", `${API.order}/customer?${qs.toString()}`);

        if (!result.res) {
            msg.show("cusOrdMsg", result.raw || "Không gọi được API đơn hàng.", "error");
            if (tb) tb.innerHTML = `<tr><td colspan="8" class="muted">Lỗi tải dữ liệu.</td></tr>`;
            return;
        }

        if (!result.res.ok) {
            msg.show("cusOrdMsg", http.getErrorText(result), "error");
            if (tb) tb.innerHTML = `<tr><td colspan="8" class="muted">Lỗi tải dữ liệu.</td></tr>`;
            return;
        }

        state.items = Array.isArray(result.data) ? result.data : [];

        const meta = pager.readMeta(result, state.items.length);
        state.pageNumber = Math.max(1, Number(meta.currentPage || 1));
        state.totalPages = Math.max(1, Number(meta.totalPages || 1));
        state.totalCount = Math.max(0, Number(meta.totalCount || 0));

        renderRows();
        renderPagerInfo();
    }

    function renderRows() {
        const tb = dom.byId("cusOrdTbody");
        if (!tb) return;

        if (!state.items.length) {
            tb.innerHTML = `<tr><td colspan="8" >Bạn chưa có đơn hàng nào.</td></tr>`;
            return;
        }

        tb.innerHTML = state.items.map((x, idx) => {
            const id = String(x.id || "");
            const rowNo = ((state.pageNumber - 1) * state.pageSize) + idx + 1;
            const itemCount = Array.isArray(x.items) ? x.items.length : 0;

            const statusKey = getStatusKey(x.orderStatus);
            const paymentKey = String(x.paymentMethod ?? "").trim().toLowerCase();
            const isCash = paymentKey === "0" || paymentKey === "cash";
            const isVnPay = paymentKey === "1" || paymentKey === "vnpay";
            const canCancel = (isCash && statusKey === "pending") || (isVnPay && statusKey === "paid");

            return `
                <tr>
                    <td>${rowNo}</td>
                    <td>
                        <div class="cell-sub">${dom.esc(id)}</div>
                    </td>
                    <td>${dom.esc(getPaymentText(x.paymentMethod))}</td>
                    <td><span class="status-badge ${getStatusClass(x.orderStatus)}">${dom.esc(getStatusText(x.orderStatus))}</span></td>
                    <td>${itemCount}</td>
                    <td>${dom.esc(formatMoney(x.totalAmount))}</td>
                    <td>${dom.esc(formatDateTime(x.updatedAt))}</td>
                    <td>
                        <div class="row-actions">
                            <button class="btn-secondary small" type="button" data-action="view" data-id="${dom.escAttr(id)}">Xem</button>
                            ${canCancel ? `<button class="btn-danger small" type="button" data-action="cancel" data-id="${dom.escAttr(id)}">Hủy</button>` : ""}
                        </div>
                    </td>
                </tr>
            `;
        }).join("");

        tb.querySelectorAll('[data-action="view"]').forEach(btn => {
            btn.addEventListener("click", () => openDetail(btn.dataset.id));
        });

        tb.querySelectorAll('[data-action="cancel"]').forEach(btn => {
            btn.addEventListener("click", () => cancelOrder(btn.dataset.id));
        });
    }

    function renderPagerInfo() {
        const info = dom.byId("cusOrdPagerInfo");
        const prevBtn = dom.byId("cusOrdPrevBtn");
        const nextBtn = dom.byId("cusOrdNextBtn");

        if (info) {
            const from = state.totalCount === 0 ? 0 : ((state.pageNumber - 1) * state.pageSize) + 1;
            const to = Math.min(state.pageNumber * state.pageSize, state.totalCount);
            info.textContent = `Trang ${state.pageNumber} / ${state.totalPages} • ${from}-${to} / ${state.totalCount}`;
        }

        if (prevBtn) prevBtn.disabled = state.pageNumber <= 1;
        if (nextBtn) nextBtn.disabled = state.pageNumber >= state.totalPages;
    }

    function prevPage() {
        if (state.pageNumber <= 1) return;
        state.pageNumber--;
        loadOrders(false);
    }

    function nextPage() {
        if (state.pageNumber >= state.totalPages) return;
        state.pageNumber++;
        loadOrders(false);
    }

    async function openDetail(id) {
        msg.show("cusOrdModalMsg", "");

        const result = await http.request("GET", `${API.order}/customer/${encodeURIComponent(id)}`);

        if (!result.res) {
            msg.show("cusOrdMsg", result.raw || "Không gọi được API chi tiết đơn hàng.", "error");
            return;
        }

        if (!result.res.ok) {
            msg.show("cusOrdMsg", http.getErrorText(result), "error");
            return;
        }

        state.current = result.data || null;
        renderModal(state.current);
        openModal();
    }

    function renderModal(order) {
        if (!order) return;

        setText("cusOrdViewId", order.id || "");
        setText("cusOrdViewPayment", getPaymentText(order.paymentMethod));
        setText("cusOrdViewStatus", getStatusText(order.orderStatus));
        setText("cusOrdViewUpdatedAt", formatDateTime(order.updatedAt));
        setText("cusOrdViewAddress", order.address || "—");
        setText("cusOrdViewTotal", formatMoney(order.totalAmount));

        const items = Array.isArray(order.items) ? order.items : [];
        const body = dom.byId("cusOrdItemsTbody");

        if (body) {
            if (!items.length) {
                body.innerHTML = `<tr><td colspan="5" class="muted">Không có chi tiết đơn hàng.</td></tr>`;
            } else {
                body.innerHTML = items.map((x, idx) => `
                    <tr>
                        <td>${idx + 1}</td>
                        <td>
                            <div class="cell-main">${dom.esc(getProductName(x.productId))}</div>
                            <div class="cell-sub">${dom.esc(x.productId || "")}</div>
                        </td>
                        <td>${Number(x.quantity || 0)}</td>
                        <td>${dom.esc(formatMoney(x.price))}</td>
                        <td>${dom.esc(formatMoney(x.totalPrice))}</td>
                    </tr>
                `).join("");
            }
        }

        renderModalActions(order);
    }

    function renderModalActions(order) {
        const statusKey = getStatusKey(order?.orderStatus);
        const paymentKey = String(order?.paymentMethod ?? "").trim().toLowerCase();
        const isCash = paymentKey === "0" || paymentKey === "cash";
        const isVnPay = paymentKey === "1" || paymentKey === "vnpay";
        const canCancel = (isCash && statusKey === "pending") || (isVnPay && statusKey === "paid");

        const btn = dom.byId("btnCusOrdCancel");
        if (btn) btn.style.display = canCancel ? "inline-flex" : "none";
    }

    async function cancelOrder(id) {
        if (!confirm("Bạn chắc chắn muốn hủy đơn hàng này?")) return;

        setCancelBusy(true);
        msg.show("cusOrdModalMsg", "");

        const result = await http.request("PUT", `${API.order}/customer/${encodeURIComponent(id)}/cancel`);

        setCancelBusy(false);

        if (!result.res) {
            const text = result.raw || "Không gọi được API hủy đơn hàng.";
            msg.show("cusOrdMsg", text, "error");
            msg.show("cusOrdModalMsg", text, "error");
            return;
        }

        if (!result.res.ok) {
            const text = http.getErrorText(result);
            msg.show("cusOrdMsg", text, "error");
            msg.show("cusOrdModalMsg", text, "error");
            return;
        }

        await loadOrders(false);

        if (state.current && String(state.current.id).toLowerCase() === String(id).toLowerCase()) {
            const fresh = await http.request("GET", `${API.order}/customer/${encodeURIComponent(id)}`);
            if (fresh?.res?.ok) {
                state.current = fresh.data;
                renderModal(state.current);
            }
        }

        msg.show("cusOrdMsg", "Hủy đơn hàng thành công.", "success");
        msg.show("cusOrdModalMsg", "Hủy đơn hàng thành công.", "success");
        setTimeout(() => msg.show("cusOrdMsg", ""), 1800);
    }

    async function cancelCurrentOrder() {
        if (!state.current?.id) return;
        await cancelOrder(state.current.id);
    }

    function setCancelBusy(disabled) {
        const btn = dom.byId("btnCusOrdCancel");
        if (btn) btn.disabled = !!disabled;
    }

    function getProductName(id) {
        const item = state.productCache.find(x =>
            String(x.id).toLowerCase() === String(id).toLowerCase()
        );
        return item?.productName || shortId(id, 12);
    }

    function getStatusKey(v) {
        const s = String(v ?? "").trim().toLowerCase();

        if (s === "0" || s === "pending") return "pending";
        if (s === "1" || s === "paid") return "paid";
        if (s === "2" || s === "confirmed") return "confirmed";
        if (s === "3" || s === "delivered") return "delivered";
        if (s === "4" || s === "canceled" || s === "cancelled") return "canceled";

        return "pending";
    }

    function getStatusText(v) {
        const s = getStatusKey(v);
        if (s === "pending") return "Pending";
        if (s === "paid") return "Paid";
        if (s === "confirmed") return "Confirmed";
        if (s === "delivered") return "Delivered";
        if (s === "canceled") return "Canceled";
        return "Pending";
    }

    function getStatusClass(v) {
        return getStatusKey(v);
    }

    function getPaymentText(v) {
        const s = String(v ?? "").trim().toLowerCase();
        if (s === "1" || s === "vnpay") return "VnPay";
        return "Cash";
    }

    function formatMoney(v) {
        const n = Number(v || 0);
        if (!isFinite(n)) return String(v ?? "0");
        return `${n.toLocaleString("vi-VN")} đ`;
    }

    function formatDateTime(v) {
        if (!v) return "—";
        const d = new Date(v);
        if (Number.isNaN(d.getTime())) return String(v);
        return d.toLocaleString("vi-VN");
    }

    function shortId(v, len = 8) {
        const s = String(v || "");
        return s.length > len ? `${s.slice(0, len)}...` : s;
    }

    function setText(id, value) {
        const el = dom.byId(id);
        if (el) el.textContent = value ?? "";
    }

    function openModal() {
        const modal = dom.byId("cusOrdModal");
        if (modal) modal.classList.add("show");
    }

    function closeModal() {
        const modal = dom.byId("cusOrdModal");
        if (modal) modal.classList.remove("show");
    }

    return {
        reload: loadOrders
    };
})();