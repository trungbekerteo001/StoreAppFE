window.StoreApp = window.StoreApp || {};                // object toàn cục
window.StoreApp.pages = window.StoreApp.pages || {};    // object con để chứa logic riêng của từng page

    // IIFE - toàn bộ hàm và biến của page chỉ dùng trong phạm vi này để tránh xung đột tên
StoreApp.pages.staffOrders = (() => {
    const dom = StoreApp.dom;               // chứa các phương thức thao tác DOM
    const http = StoreApp.http;             // chứa phương thức request để gọi API
    const role = StoreApp.role;             // chứa phương thức guard và decode role/token
    const msg = StoreApp.message;           // chứa phương thức show để hiển thị thông báo
    const pager = StoreApp.pager;           // chứa helper đọc metadata phân trang

    const API = {                       // chứa endpoint API dùng trong page này
        order: "/api/Order",
        product: "/api/Product"
    };

    const state = {                     // state để lưu trạng thái hiện tại của page
        items: [],              // danh sách order ở trang hiện tại
        productCache: [],       // cache product để map productId -> productName
        current: null,          // order đang mở trong modal

        pageNumber: 1,
        pageSize: 10,
        totalPages: 1,
        totalCount: 0
    };

    // khi DOM đã sẵn sàng thì gọi hàm initPage để khởi tạo page
    document.addEventListener("DOMContentLoaded", initPage);

    // hàm khởi tạo page order của staff: kiểm tra role, gán event, tải dữ liệu phụ rồi load order

    async function initPage() {
        if (!role.guard(["Staff"])) return;

        bindEvents();
        await loadMeta();
        await loadOrders();
    }

    // gom event cho refresh, phân trang, modal và các nút thao tác đơn hàng

    function bindEvents() {
        dom.byId("btnOrdRefresh")?.addEventListener("click", refreshOrders);

        dom.byId("ordPrevBtn")?.addEventListener("click", prevPage);
        dom.byId("ordNextBtn")?.addEventListener("click", nextPage);

        dom.byId("btnOrdCloseX")?.addEventListener("click", closeModal);
        dom.byId("btnOrdClose")?.addEventListener("click", closeModal);
        dom.byId("ordModalBackdrop")?.addEventListener("click", closeModal);

        dom.byId("ordConfirmBtn")?.addEventListener("click", confirmCurrent);
        dom.byId("ordDeliverBtn")?.addEventListener("click", deliverCurrent);
        dom.byId("ordCancelBtn")?.addEventListener("click", cancelCurrent);

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") closeModal();
        });
    }

    // tải trước danh sách product để map productId sang tên sản phẩm

    async function loadMeta() {
        // Load trước danh sách product để khi xem chi tiết order
        // có thể hiện tên sản phẩm thay vì chỉ hiện productId
        const result = await http.request("GET", `${API.product}?PageSize=500`);
        state.productCache = (result?.res?.ok && Array.isArray(result.data)) ? result.data : [];
    }

    // load danh sách đơn hàng staff được xem theo phân trang

    async function loadOrders(clearMessage = true) {
        if (clearMessage) {
            msg.show("ordMsg", "");
        }

        const tb = dom.byId("ordTbody");
        if (tb) {
            tb.innerHTML = `<tr><td colspan="9" class="muted">Đang tải...</td></tr>`;
        }

        // tạo queryString để gửi filter / phân trang lên API
        const qs = new URLSearchParams();
        qs.set("PageNumber", String(state.pageNumber));
        qs.set("PageSize", String(state.pageSize));

        const result = await http.request("GET", `${API.order}/staff?${qs.toString()}`);

        if (!result.res) {
            msg.show("ordMsg", result.raw || "Không gọi được API.", "error");
            if (tb) tb.innerHTML = `<tr><td colspan="9" class="muted">Lỗi tải dữ liệu.</td></tr>`;
            return;
        }

        if (!result.res.ok) {
            msg.show("ordMsg", http.getErrorText(result), "error");
            if (tb) tb.innerHTML = `<tr><td colspan="9" class="muted">Lỗi tải dữ liệu.</td></tr>`;
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

    // tải lại danh sách order hiện tại

    function refreshOrders() {
        loadOrders();
    }

    // render các đơn hàng ra table và gán event cho các nút thao tác

    function renderRows() {
        const tb = dom.byId("ordTbody");
        if (!tb) return;

        if (!state.items || state.items.length === 0) {
            tb.innerHTML = `<tr><td colspan="9" class="muted">Không có dữ liệu.</td></tr>`;
            return;
        }

        tb.innerHTML = state.items.map((x, idx) => {
            const id = String(x.id || "");
            const statusKey = getStatusKey(x.orderStatus);

            const paymentKey = String(x.paymentMethod ?? "").trim().toLowerCase();
            const isCash = paymentKey === "0" || paymentKey === "cash";
            const isVnPay = paymentKey === "1" || paymentKey === "vnpay";

            const canConfirm = (isCash && statusKey === "pending") || (isVnPay && statusKey === "paid");
            const canDeliver = statusKey === "confirmed";
            const canCancel = (isCash && statusKey === "pending") || (isVnPay && statusKey === "paid");

            const rowNo = ((state.pageNumber - 1) * state.pageSize) + idx + 1;
            const itemCount = Array.isArray(x.items) ? x.items.length : 0;

            return `
                <tr>
                    <td>${rowNo}</td>
                    <td>
                        <div class="cell-main">${dom.esc(shortId(id, 10))}</div>
                        <div class="cell-sub">${dom.esc(id)}</div>
                    </td>
                    <td>${dom.esc(shortId(x.customerId, 10))}</td>
                    <td>${dom.esc(getPaymentText(x.paymentMethod))}</td>
                    <td><span class="status-badge ${getStatusClass(x.orderStatus)}">${dom.esc(getStatusText(x.orderStatus))}</span></td>
                    <td>${itemCount}</td>
                    <td>${dom.esc(formatMoney(x.totalAmount))}</td>
                    <td>${dom.esc(formatDateTime(x.updatedAt))}</td>
                    <td>
                        <div class="row-actions">
                            <button class="btn" type="button" data-action="view" data-id="${dom.escAttr(id)}">Xem</button>
                            ${canConfirm ? `<button class="btn primary" type="button" data-action="confirm" data-id="${dom.escAttr(id)}">Xác nhận</button>` : ""}
                            ${canDeliver ? `<button class="btn primary" type="button" data-action="deliver" data-id="${dom.escAttr(id)}">Giao hàng</button>` : ""}
                            ${canCancel ? `<button class="btn danger" type="button" data-action="cancel" data-id="${dom.escAttr(id)}">Hủy</button>` : ""}
                        </div>
                    </td>
                </tr>
            `;
        }).join("");

        // gán sự kiện cho từng nút xem chi tiết sau khi render
        tb.querySelectorAll('[data-action="view"]').forEach(btn => {
            btn.addEventListener("click", () => openView(btn.dataset.id));
        });

        // gán sự kiện cho từng nút xác nhận sau khi render
        tb.querySelectorAll('[data-action="confirm"]').forEach(btn => {
            btn.addEventListener("click", () => confirmOrder(btn.dataset.id));
        });

        // gán sự kiện cho từng nút giao hàng sau khi render
        tb.querySelectorAll('[data-action="deliver"]').forEach(btn => {
            btn.addEventListener("click", () => deliverOrder(btn.dataset.id));
        });

        // gán sự kiện cho từng nút hủy sau khi render
        tb.querySelectorAll('[data-action="cancel"]').forEach(btn => {
            btn.addEventListener("click", () => cancelOrder(btn.dataset.id));
        });
    }

    // load chi tiết đơn hàng rồi mở modal xem

    async function openView(id) {
        msg.show("ordModalMsg", "");

        const result = await http.request("GET", `${API.order}/staff/${encodeURIComponent(id)}`);

        if (!result.res) {
            msg.show("ordMsg", result.raw || "Không gọi được API.", "error");
            return;
        }

        if (!result.res.ok) {
            msg.show("ordMsg", http.getErrorText(result), "error");
            return;
        }

        state.current = result.data || null;
        renderModal(state.current);
        openModal();
    }

    // đổ dữ liệu đơn hàng đang chọn vào modal

    function renderModal(order) {
        if (!order) return;

        setText("ordViewId", order.id || "");
        setText("ordViewCustomerId", order.customerId || "");
        setText("ordViewStaffId", order.staffId || "—");
        setText("ordViewPayment", getPaymentText(order.paymentMethod));
        setText("ordViewStatus", getStatusText(order.orderStatus));
        setText("ordViewUpdatedAt", formatDateTime(order.updatedAt));
        setText("ordViewTotal", formatMoney(order.totalAmount));
        setText("ordViewAddress", order.address || "—");

        const body = dom.byId("ordItemsTbody");
        const items = Array.isArray(order.items) ? order.items : [];

        if (body) {
            if (items.length === 0) {
                body.innerHTML = `<tr><td colspan="5" class="muted">Không có chi tiết đơn hàng.</td></tr>`;
            } else {
                body.innerHTML = items.map((x, idx) => {
                    const productName = getProductName(x.productId);

                    return `
                        <tr>
                            <td>${idx + 1}</td>
                            <td>
                                <div class="cell-main">${dom.esc(productName)}</div>
                                <div class="cell-sub">${dom.esc(x.productId || "")}</div>
                            </td>
                            <td>${Number(x.quantity || 0)}</td>
                            <td>${dom.esc(formatMoney(x.price))}</td>
                            <td>${dom.esc(formatMoney(x.totalPrice))}</td>
                        </tr>
                    `;
                }).join("");
            }
        }

        renderModalActions(order);
    }

    // ẩn/hiện nút xác nhận, giao hàng, hủy theo trạng thái đơn

    function renderModalActions(order) {
        const statusKey = getStatusKey(order?.orderStatus);

        const paymentKey = String(order?.paymentMethod ?? "").trim().toLowerCase();
        const isCash = paymentKey === "0" || paymentKey === "cash";
        const isVnPay = paymentKey === "1" || paymentKey === "vnpay";

        toggleActionBtn("ordConfirmBtn", (isCash && statusKey === "pending") || (isVnPay && statusKey === "paid"));
        toggleActionBtn("ordDeliverBtn", statusKey === "confirmed");
        toggleActionBtn("ordCancelBtn", (isCash && statusKey === "pending") || (isVnPay && statusKey === "paid"));
    }

    // ẩn hoặc hiện 1 nút thao tác trong modal

    function toggleActionBtn(id, visible) {
        const btn = dom.byId(id);
        if (!btn) return;
        btn.style.display = visible ? "inline-flex" : "none";
    }

    // xác nhận đơn hàng theo id

    async function confirmOrder(id) {
        await runActionById(id, "confirm", "Xác nhận đơn hàng thành công.", "xác nhận");
    }

    // chuyển đơn hàng sang trạng thái giao hàng

    async function deliverOrder(id) {
        await runActionById(id, "deliver", "Chuyển trạng thái giao hàng thành công.", "giao hàng");
    }

    // hủy đơn hàng theo id

    async function cancelOrder(id) {
        await runActionById(id, "cancel", "Hủy đơn hàng thành công.", "hủy");
    }

    // xác nhận đơn hàng đang mở trong modal

    async function confirmCurrent() {
        if (state.current?.id) await confirmOrder(state.current.id);
    }

    // giao đơn hàng đang mở trong modal

    async function deliverCurrent() {
        if (state.current?.id) await deliverOrder(state.current.id);
    }

    // hủy đơn hàng đang mở trong modal

    async function cancelCurrent() {
        if (state.current?.id) await cancelOrder(state.current.id);
    }

    // hàm dùng chung để gọi API thao tác đơn hàng theo action

    async function runActionById(id, action, successText, actionLabel) {
        if (!id) return;
        if (!confirm(`Bạn chắc chắn muốn ${actionLabel} đơn hàng này?`)) return;

        setActionBusy(true);
        msg.show("ordModalMsg", "");

        let url = "";

        if (action === "cancel") {
            url = `${API.order}/staff/${encodeURIComponent(id)}/cancel`;
        } else {
            url = `${API.order}/${encodeURIComponent(id)}/${action}`;
        }

        const result = await http.request("PUT", url);

        setActionBusy(false);

        if (!result.res) {
            msg.show("ordModalMsg", result.raw || "Không gọi được API.", "error");
            return;
        }

        if (!result.res.ok) {
            msg.show("ordModalMsg", http.getErrorText(result), "error");
            return;
        }

        await loadOrders(false);

        if (state.current && String(state.current.id).toLowerCase() === String(id).toLowerCase()) {
            const fresh = await http.request("GET", `${API.order}/staff/${encodeURIComponent(id)}`);
            if (fresh?.res?.ok) {
                state.current = fresh.data;
                renderModal(state.current);
            }
        }

        msg.show("ordMsg", successText, "success");
        msg.show("ordModalMsg", successText, "success");
        setTimeout(() => msg.show("ordMsg", ""), 1800);
    }

    // khóa/mở các nút thao tác để tránh bấm lặp

    function setActionBusy(disabled) {
        ["ordConfirmBtn", "ordDeliverBtn", "ordCancelBtn"].forEach(id => {
            const btn = dom.byId(id);
            if (btn) btn.disabled = !!disabled;
        });
    }

    // map productId sang tên product từ cache

    function getProductName(id) {
        const item = state.productCache.find(x =>
            String(x.id).toLowerCase() === String(id).toLowerCase()
        );
        return item?.productName || shortId(id, 12);
    }

    // chuẩn hóa orderStatus về key thống nhất

    function getStatusKey(v) {
        const s = String(v ?? "").trim().toLowerCase();

        if (s === "0" || s === "pending") return "pending";
        if (s === "1" || s === "paid") return "paid";
        if (s === "2" || s === "confirmed") return "confirmed";
        if (s === "3" || s === "delivered") return "delivered";
        if (s === "4" || s === "canceled" || s === "cancelled") return "canceled";

        return "pending";
    }

    // đổi trạng thái sang text để hiển thị

    function getStatusText(v) {
        const s = getStatusKey(v);
        if (s === "pending") return "Pending";
        if (s === "paid") return "Paid";
        if (s === "confirmed") return "Confirmed";
        if (s === "delivered") return "Delivered";
        if (s === "canceled") return "Canceled";
        return "Pending";
    }

    // đổi trạng thái sang class CSS

    function getStatusClass(v) {
        return getStatusKey(v);
    }

    // đổi paymentMethod sang text hiển thị

    function getPaymentText(v) {
        const s = String(v ?? "").trim().toLowerCase();
        if (s === "1" || s === "vnpay") return "VnPay";
        return "Cash";
    }

    // format tiền tệ theo kiểu Việt Nam

    function formatMoney(v) {
        const n = Number(v || 0);
        if (!isFinite(n)) return String(v ?? "0");
        return `${n.toLocaleString("vi-VN")} ₫`;
    }

    // format ngày giờ để hiển thị

    function formatDateTime(v) {
        if (!v) return "—";

        const d = new Date(v);
        if (Number.isNaN(d.getTime())) return String(v);

        return d.toLocaleString("vi-VN");
    }

    // rút gọn id dài để hiển thị gọn hơn

    function shortId(v, len = 8) {
        const s = String(v || "");
        return s.length > len ? `${s.slice(0, len)}...` : s;
    }

    // gán textContent cho element theo id

    function setText(id, text) {
        const el = dom.byId(id);
        if (el) el.textContent = text ?? "";
    }

    // mở modal chi tiết order

    function openModal() {
        const m = dom.byId("ordModal");
        if (m) m.classList.add("show");
    }

    // đóng modal chi tiết order

    function closeModal() {
        const m = dom.byId("ordModal");
        if (m) m.classList.remove("show");
    }

    // hiển thị thông tin phân trang và trạng thái nút Prev Next

    function renderPagerInfo() {
        const info = dom.byId("ordPagerInfo");
        const prevBtn = dom.byId("ordPrevBtn");
        const nextBtn = dom.byId("ordNextBtn");

        if (info) {
            const from = state.totalCount === 0 ? 0 : ((state.pageNumber - 1) * state.pageSize) + 1;
            const to = Math.min(state.pageNumber * state.pageSize, state.totalCount);
            info.textContent = `Trang ${state.pageNumber} / ${state.totalPages} • ${from}-${to} / ${state.totalCount}`;
        }

        if (prevBtn) prevBtn.disabled = state.pageNumber <= 1;
        if (nextBtn) nextBtn.disabled = state.pageNumber >= state.totalPages;
    }

    // lùi về trang trước

    function prevPage() {
        if (state.pageNumber <= 1) return;
        state.pageNumber--;
        loadOrders(false);
    }

    // sang trang tiếp theo

    function nextPage() {
        if (state.pageNumber >= state.totalPages) return;
        state.pageNumber++;
        loadOrders(false);
    }

    return {
        reload: loadOrders
    };
})();