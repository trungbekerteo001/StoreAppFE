window.StoreApp = window.StoreApp || {};
window.StoreApp.pages = window.StoreApp.pages || {};

StoreApp.pages.customerAddresses = (() => {
    const dom = StoreApp.dom;
    const http = StoreApp.http;
    const role = StoreApp.role;
    const msg = StoreApp.message;

    const API = {
        address: "/api/CustomerAddress"
    };

    const state = {
        items: []
    };

    document.addEventListener("DOMContentLoaded", initPage);

    async function initPage() {
        if (!role.guard(["Customer"])) return;

        bindEvents();
        await loadAddresses();
    }

    function bindEvents() {
        dom.byId("btnAddrSave")?.addEventListener("click", saveAddress);
        dom.byId("btnAddrReset")?.addEventListener("click", resetForm);

        document.addEventListener("click", (e) => {
            const btn = e.target.closest("[data-address-action]");
            if (!btn) return;

            const id = btn.dataset.id || "";
            const action = btn.dataset.addressAction;

            if (action === "edit") editAddress(id);
            if (action === "delete") deleteAddress(id);
            if (action === "default") setDefaultAddress(id);
        });
    }

    async function loadAddresses(clearMessage = true) {
        if (clearMessage) msg.show("addrMsg", "");

        const box = dom.byId("addressList");
        if (box) box.innerHTML = `<div class="empty-box">Đang tải địa chỉ...</div>`;

        const result = await http.request("GET", API.address);

        if (!result.res) {
            msg.show("addrMsg", result.raw || "Không gọi được API địa chỉ.", "error");
            if (box) box.innerHTML = `<div class="empty-box">Lỗi tải dữ liệu.</div>`;
            return;
        }

        if (!result.res.ok) {
            msg.show("addrMsg", http.getErrorText(result), "error");
            if (box) box.innerHTML = `<div class="empty-box">Lỗi tải dữ liệu.</div>`;
            return;
        }

        state.items = Array.isArray(result.data) ? result.data : [];
        renderAddresses();
    }

    function renderAddresses() {
        const box = dom.byId("addressList");
        if (!box) return;

        if (!state.items.length) {
            box.innerHTML = `<div class="empty-box">Bạn chưa có địa chỉ giao hàng.</div>`;
            return;
        }

        box.innerHTML = state.items.map(x => `
            <div class="address-item">
                <div class="address-top">
                    <strong>${dom.esc(x.receiverName || "")}</strong>
                    ${x.isDefault ? `<span class="default-badge">Mặc định</span>` : ""}
                </div>

                <div class="muted">${dom.esc(x.phone || "")}</div>
                <div class="address-line">${dom.esc(x.addressLine || "")}</div>

                <div class="address-actions">
                    <button class="btn-secondary small" type="button" data-address-action="edit" data-id="${dom.escAttr(x.id)}">Sửa</button>
                    ${!x.isDefault ? `<button class="btn-secondary small" type="button" data-address-action="default" data-id="${dom.escAttr(x.id)}">Đặt mặc định</button>` : ""}
                    <button class="btn-danger small" type="button" data-address-action="delete" data-id="${dom.escAttr(x.id)}">Xóa</button>
                </div>
            </div>
        `).join("");
    }

    function editAddress(id) {
        const item = state.items.find(x => String(x.id).toLowerCase() === String(id).toLowerCase());
        if (!item) return;

        setValue("addrId", item.id || "");
        setValue("addrReceiverName", item.receiverName || "");
        setValue("addrPhone", item.phone || "");
        setValue("addrAddressLine", item.addressLine || "");

        const isDefault = dom.byId("addrIsDefault");
        if (isDefault) isDefault.checked = !!item.isDefault;

        const title = dom.byId("addrFormTitle");
        if (title) title.textContent = "Cập nhật địa chỉ";

        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    async function saveAddress() {
        msg.show("addrMsg", "");

        const id = dom.byId("addrId")?.value || "";
        const receiverName = dom.byId("addrReceiverName")?.value?.trim() || "";
        const phone = dom.byId("addrPhone")?.value?.trim() || "";
        const addressLine = dom.byId("addrAddressLine")?.value?.trim() || "";
        const isDefault = !!dom.byId("addrIsDefault")?.checked;

        if (!receiverName || !phone || !addressLine) {
            msg.show("addrMsg", "Vui lòng nhập đầy đủ tên người nhận, số điện thoại và địa chỉ.", "warn");
            return;
        }

        if (!/^\d{10}$/.test(phone)) {
            msg.show("addrMsg", "Số điện thoại phải gồm đúng 10 chữ số.", "warn");
            return;
        }

        const body = {
            id: id || "00000000-0000-0000-0000-000000000000",
            customerId: null,
            receiverName,
            phone,
            addressLine,
            isDefault
        };

        const btn = dom.byId("btnAddrSave");
        if (btn) {
            btn.disabled = true;
            btn.textContent = "Đang lưu...";
        }

        try {
            const result = id
                ? await http.request("PUT", `${API.address}/${encodeURIComponent(id)}`, body)
                : await http.request("POST", API.address, body);

            if (!result.res) {
                msg.show("addrMsg", result.raw || "Không gọi được API lưu địa chỉ.", "error");
                return;
            }

            if (!result.res.ok) {
                msg.show("addrMsg", http.getErrorText(result), "error");
                return;
            }

            resetForm();
            await loadAddresses(false);
            msg.show("addrMsg", id ? "Cập nhật địa chỉ thành công." : "Thêm địa chỉ thành công.", "success");
            setTimeout(() => msg.show("addrMsg", ""), 1800);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = "Lưu địa chỉ";
            }
        }
    }

    async function setDefaultAddress(id) {
        const result = await http.request("PUT", `${API.address}/${encodeURIComponent(id)}/default`);

        if (!result.res) {
            msg.show("addrMsg", result.raw || "Không gọi được API đặt mặc định.", "error");
            return;
        }

        if (!result.res.ok) {
            msg.show("addrMsg", http.getErrorText(result), "error");
            return;
        }

        await loadAddresses(false);
        msg.show("addrMsg", "Đã đặt địa chỉ mặc định.", "success");
        setTimeout(() => msg.show("addrMsg", ""), 1800);
    }

    async function deleteAddress(id) {
        if (!confirm("Bạn chắc chắn muốn xóa địa chỉ này?")) return;

        const result = await http.request("DELETE", `${API.address}/${encodeURIComponent(id)}`);

        if (!result.res) {
            msg.show("addrMsg", result.raw || "Không gọi được API xóa địa chỉ.", "error");
            return;
        }

        if (!result.res.ok) {
            msg.show("addrMsg", http.getErrorText(result), "error");
            return;
        }

        resetForm();
        await loadAddresses(false);
        msg.show("addrMsg", "Xóa địa chỉ thành công.", "success");
        setTimeout(() => msg.show("addrMsg", ""), 1800);
    }

    function resetForm() {
        setValue("addrId", "");
        setValue("addrReceiverName", "");
        setValue("addrPhone", "");
        setValue("addrAddressLine", "");

        const isDefault = dom.byId("addrIsDefault");
        if (isDefault) isDefault.checked = false;

        const title = dom.byId("addrFormTitle");
        if (title) title.textContent = "Thêm địa chỉ mới";
    }

    function setValue(id, value) {
        const el = dom.byId(id);
        if (el) el.value = value;
    }

    return {
        reload: loadAddresses
    };
})();
