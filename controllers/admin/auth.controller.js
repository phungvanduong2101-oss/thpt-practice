const Account = require("../../models/account.model"); 
const bcrypt = require("bcryptjs"); 
const jwt = require("jsonwebtoken"); 

module.exports.login = (req, res) => {
    res.render("admin/login");
}  

module.exports.loginPost = async (req, res) => {
  try {
    const { password, remember } = req.body;
    const email = req.body.email.trim().toLowerCase();

    const account = await Account.findOne({ email })
      .select("+password");

    if (!account) {
      return res.status(401).json({
        code: "error",
        message: "Tên đăng nhập hoặc mật khẩu không đúng!",
      });
    }

    const passwordMatch = await bcrypt.compare(
      password,
      account.password
    );

    if (!passwordMatch) {
      return res.status(401).json({
        code: "error",
        message: "Tên đăng nhập hoặc mật khẩu không đúng!",
      });
    }

    if (account.status !== "active") {
      return res.status(403).json({
        code: "error",
        message: "Tài khoản đã bị khóa!",
      });
    }

    const rememberMe = remember === true;
    const expiresIn = rememberMe ? "7d" : "1d";

    const token = jwt.sign(
      { accountId: account._id.toString() },
      process.env.JWT_SECRET,
      { expiresIn }
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      ...(rememberMe
        ? { maxAge: 7 * 24 * 60 * 60 * 1000 }
        : {}),
    });

    return res.json({
      code: "success",
      message: "Đăng nhập thành công!",
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      code: "error",
      message: "Đăng nhập thất bại!",
    });
  }
}; 

module.exports.register = (req, res) => {
    res.render("admin/register");
} 
 
module.exports.registerPost = async (req, res) => {
  try {
    const { fullName, password ,email} = req.body;


    const existedAccount = await Account.findOne({ email });

    if (existedAccount) {
      return res.status(409).json({
        code: "error",
        message: "Email đã được sử dụng!",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await Account.create({
      fullName,
      email,
      password: passwordHash, 
    });

    return res.status(201).json({
      code: "success",
      message: "Đăng ký thành công!",
    });
  } catch (error) {
   
    return res.status(500).json({
      code: "error",
      message: "Đăng ký thất bại!",
    });
  }
}; 

module.exports.logout = (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });

  return res.redirect("/admin/auth/login");
};
