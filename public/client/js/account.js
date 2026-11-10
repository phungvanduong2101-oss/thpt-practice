"use strict";
document.querySelectorAll("[data-account-form]").forEach(form=>{
  form.onsubmit=async event=>{
    event.preventDefault();
    const button=form.querySelector("button");if(button.disabled)return;
    const body=new FormData(form),multipart=form.enctype==="multipart/form-data";
    if(multipart&&body.get("image").size>3*1024*1024){alert("Ảnh tối đa 3 MB.");return;}
    button.disabled=true;
    try{
      const response=await fetch(form.action,{method:"POST",headers:multipart?{Accept:"application/json"}:{Accept:"application/json","Content-Type":"application/json"},body:multipart?body:JSON.stringify(Object.fromEntries(body))});
      const data=await response.json();
      if(!response.ok)throw Error(data.message||"Cập nhật thất bại.");
      alert(data.message);location.reload();
    }catch(error){alert(error instanceof SyntaxError?"Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.":error.message);}
    finally{button.disabled=false;}
  };
});
let previewUrl;
document.querySelector("#avatarInput").onchange=event=>{
  const file=event.target.files[0];if(!file)return;
  if(previewUrl)URL.revokeObjectURL(previewUrl);
  previewUrl=URL.createObjectURL(file);
  const preview=document.querySelector("#avatarPreview");preview.src=previewUrl;preview.hidden=false;
};
