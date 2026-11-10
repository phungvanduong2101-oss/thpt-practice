"use strict";
document.querySelectorAll("[data-post-form]").forEach((form) => {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (form.dataset.busy === "true") return;
    if(form.dataset.uploading==="true"){alert("Vui lòng đợi ảnh tải xong.");return;}
    if (form.dataset.confirm && !confirm(form.dataset.confirm)) return;
    form.dataset.busy = "true";
    const buttons = form.querySelectorAll("button");
    buttons.forEach((b) => (b.disabled = true));
    try {
      const response = await fetch(form.action, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({...Object.fromEntries(new FormData(form)), ...(form.querySelector("textarea")?{images:JSON.parse(form.dataset.images||"[]")}:{})}),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.message || "Thao tác thất bại.");
      alert(data.message);
      if (form.hasAttribute("data-reload")) {
        location.reload();
      } else {
        location.assign(data.redirectUrl);
      }
    } catch (error) {
      alert(
        error instanceof SyntaxError
          ? "Phiên đăng nhập đã hết hạn hoặc máy chủ không phản hồi hợp lệ."
          : error.message,
      );
    } finally {
      form.dataset.busy = "false";
      buttons.forEach((b) => (b.disabled = false));
    }
  });
});
document.querySelectorAll("[data-quote]").forEach(
  (button) =>
    (button.onclick = () => {
      document.querySelector("#quotedCommentId").value = button.dataset.quote;
      document.querySelector("#quoteAuthor").textContent =
        button.dataset.author + " viết:";
      document.querySelector("#quoteText").textContent = button.dataset.content;
      document.querySelector("#quotePreview").hidden = false;
      document
        .querySelector("#commentComposer")
        .scrollIntoView({ behavior: "smooth", block: "center" });
      document.querySelector("#commentContent").focus({ preventScroll: true });
    }),
);
const cancel = document.querySelector("#cancelQuote");
if (cancel)
  cancel.onclick = () => {
    document.querySelector("#quotedCommentId").value = "";
    document.querySelector("#quotePreview").hidden = true;
  };


document.querySelectorAll(".posts-page[data-image-upload] [data-post-form]:has(textarea)").forEach(form=>{
  const images=JSON.parse(form.dataset.images||"[]");
  const area=document.createElement("div");area.className="post-image-tools";
  const label=document.createElement("label");label.textContent="Thêm ảnh (tối đa 6 ảnh, 3 MB/ảnh)";
  const picker=document.createElement("input");picker.type="file";picker.multiple=true;picker.accept="image/jpeg,image/png,image/webp,image/gif";
  const preview=document.createElement("div");preview.className="post-image-preview";
  label.append(picker);area.append(label,preview);
  form.querySelector("textarea").after(area);
  function render(){
    form.dataset.images=JSON.stringify(images);preview.replaceChildren();
    images.forEach((url,index)=>{
      const item=document.createElement("div"),img=document.createElement("img"),remove=document.createElement("button");
      img.src=url;img.alt="Ảnh đính kèm";remove.type="button";remove.textContent="Bỏ ảnh";
      remove.onclick=()=>{images.splice(index,1);render();};
      item.append(img,remove);preview.append(item);
    });
  }
  picker.onchange=async()=>{
    const files=[...picker.files];picker.value="";
    if(files.length+images.length>6){alert("Tối đa 6 ảnh.");return;}
    if(files.some(file=>file.size>3*1024*1024)){alert("Mỗi ảnh tối đa 3 MB.");return;}
    form.dataset.uploading="true";picker.disabled=true;
    try{
      for(const file of files){
        const body=new FormData();body.append("image",file);
        const response=await fetch(document.querySelector(".posts-page").dataset.imageUpload,{method:"POST",headers:{Accept:"application/json"},body});
        const data=await response.json();if(!response.ok)throw Error(data.message||"Không tải được ảnh.");
        images.push(data.url);render();
      }
    }catch(error){alert(error.message||"Tải ảnh thất bại.");}
    finally{form.dataset.uploading="false";picker.disabled=false;}
  };
  render();
});
