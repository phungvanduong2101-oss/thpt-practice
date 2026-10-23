 const Latex = require("../../models/latex.model");
module.exports.index = async (req, res) => {
  try {
 
    const search = req.query.search || ""; 
    const page = Number(req.query.page) || 1; 
    const limit = 10; 
    const skip = (page - 1) * limit; 
 
    const where = {}; 
    if(search) { 
      where.name = { $regex: search, $options: "i" };
    } 

    const latexList = await Latex.find(where)
      .sort({ createdAt: -1 }).skip(skip).limit(limit)
      .lean(); 
 
    const totalLatex = await Latex.countDocuments(where);
    const totalPage = Math.ceil(totalLatex / limit); 
 
    res.render("admin/latex", {
      title: "Latex",
      activePage: "latex",
      formulas: latexList,
      search,
      currentPageLatex: page,
      totalPage, 
      skip, 
      totalLatex
    });


  } catch (error) {
    console.error("Lỗi truy vấn Latex:", error);

    res.status(500).json({
      code: "error",
      message: "Có lỗi xảy ra!",
    });
  }
};

module.exports.create = (req, res) => {
    try { 
       res.render("admin/latex-create",{ 
           title: "Latex", 
           activePage: "latex"
       });
    } catch(error) { 
        res.json({ code: "error", message: 'Có lỗi xảy ra!' });
    }
} 

module.exports.createPost = async (req, res) => {
    try {   
    
        const {name,latex,html} = req.body; 
        const latexObject = await Latex.create({ 
            name : name, 
            code : latex, 
            html : html
        }); 
        res.json({ code: "success", message: 'Tạo công thức thành công!' });


    } catch(error) { 
        res.json({ code: "error", message: 'Có lỗi xảy ra!' });
    }
} 

module.exports.edit = async (req, res) => {
    try { 
        const id = req.params.id; 
        const latex = await Latex.findById(id).lean(); 
        res.render("admin/latex-edit", { 
            title: "Latex", 
            activePage: "latex", 
            latex
        });
    } catch(error) { 
        res.json({ code: "error", message: 'Có lỗi xảy ra!' });
    }
} 

module.exports.editPatch = async (req, res) => {
  try {  
    const id = req.params.id; 
    await Latex.updateOne({ _id: id }, req.body);
    res.json({ code: "success", message: 'Cập nhật công thức thành công!' });

  } catch(error) { 
      res.json({ code: "error", message: 'Có lỗi xảy ra!' });
  }
} 

module.exports.delete = async (req, res) => {
  try { 
    const id = req.params.id; 
    await Latex.deleteOne({ _id: id });
    res.json({ code: "success", message: 'Xóa công thức thành công!' });
  } catch(error) { 
      res.json({ code: "error", message: 'Có lỗi xảy ra!' });
  }
}