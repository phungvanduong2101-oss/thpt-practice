 const bcrypt = require("bcryptjs"); 
 const jwt = require("jsonwebtoken");
 const Account = require("../../models/account.model"); 

 module.exports.login = (req, res) => {
    res.render("client/login");
} 

module.exports.register = (req, res) => {
    res.render("client/register");
} 

module.exports.loginPost = async (req, res) => {  
    try { 
      const {email,password} = req.body; 
      const existAccount = await Account.findOne({email}).select("+password"); 
      if(!existAccount) { 
        return res.json({code:'error',message:'Tên đăng nhập hoặc mật khẩu không đúng!'});
      } 
      const passwordMatch = await bcrypt.compare(password,existAccount.password); 
      if(!passwordMatch) { 
        return res.json({code:'error',message:'Tên đăng nhập hoặc mật khẩu không đúng!'}); 
      }  

      if(existAccount.status !== "active") { 
        return res.json({code:'error',message:'Tài khoản đã bị khóa!'}); 
      }

      const token = jwt.sign({id: existAccount._id},process.env.JWT_SECRET);  
      res.cookie("token", token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 24 * 60 * 60 * 1000 });
      res.json({code:'success',message:'Đăng nhập thành công!'});
    }catch(error) {  
        console.error("Lỗi đăng nhập:", error);
        res.json({code:'error',message:'Đăng nhập thất bại!'});
    }
} 

module.exports.registerPost = async (req, res) => {
    try { 
       const { fullName, password ,email} = req.body; 
       const existedAccount = await Account.findOne({ email });  

       if(existedAccount) { 
        res.json({code:'error' , message:"Email đã tồn tại!"})
       } 
    
       const passwordHash = await bcrypt.hash(password, 10);  
       await Account.create({fullName, email, password: passwordHash,role:"user",status: "active"}); 
       res.json({code: "success", message: "Tạo tài khoản thành công!"});

    } catch (error) {
      res.json({code: "error", message: "Tạo tài khoản thất bại!"});   
    }
}
 
module.exports.logout = (req, res) => {
    res.clearCookie("token");
    res.redirect("/");
}