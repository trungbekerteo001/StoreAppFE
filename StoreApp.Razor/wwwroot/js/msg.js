function showMsg(id, text, type) {
    // id: id của phần tử cần hiện thông báo(ví dụ < div id = "loginMsg" ></div >)
    // text: nội dung thông báo
    // type: loại thông báo(ví dụ "success", "error", "warn"…)
    const el = document.getElementById(id);
    if (!el) return;

    const msg = (text ?? "").toString();

    // Rỗng -> ẩn hẳn
    if (!msg.trim()) {
        el.style.display = "none";
        el.textContent = "";
        el.className = "msg";
        return;
    }

    // Có nội dung -> hiện
    el.style.display = "block";

    const t = (type ?? "").toString().trim();
    el.className = "msg" + (t ? ` ${t}` : "");
    el.textContent = msg;
}