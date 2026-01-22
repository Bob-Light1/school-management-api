const Class = require('../models/classes.model');

/**
 * @desc    Create a new class
 * @route   POST /api/classes
 * @access  Admin / Manager
 */

exports.createClass = async (req, res) => {
  try {
    const {
      schoolCampus,
      level,
      className,
      classManager,
      maxStudents
    } = req.body;

    // Minimal validation
    if (!schoolCampus || !level || !className) {
      return res.status(400).json({
        success: false,
        message: 'schoolCampus, level, and className are required'
      });
    }

    // Check for duplicates (same campus + level + name)
    const existingClass = await Class.findOne({
      schoolCampus,
      level,
      className: className.trim()
    });

    if (existingClass) {
      return res.status(409).json({
        success: false,
        message: 'A class with this name already exists for this level and campus'
      });
    }

    // Create the class
    const newClass = await Class.create({
      schoolCampus,
      level,
      className: className.trim(),
      classManager: classManager || null,
      maxStudents: maxStudents || undefined
    });

    return res.status(201).json({
      success: true,
      message: 'Class created successfully',
      data: newClass
    });

  } catch (error) {
    console.error('❌ createClass error:', error);

    return res.status(500).json({
      success: false,
      message: 'Server error while creating the class'
    });
  }
};



/**
 * @desc    Update an existing class
 * @route   PUT /api/classes/:id
 * @access  Admin / Manager
 */

exports.updateClass = async (req, res) => {
  try {
    const classId = req.params.id;

    // Check if class exists
    const existingClass = await Class.findById(classId);

    if (!existingClass) {
      return res.status(404).json({
        success: false,
        message: 'Class not found'
      });
    }

    const {
      schoolCampus,
      level,
      className,
      classManager,
      status,
      maxStudents
    } = req.body;

    // Prevent duplicate classes (same campus + level + className)
    if (schoolCampus || level || className) {
      const duplicateClass = await Class.findOne({
        _id: { $ne: classId },
        schoolCampus: schoolCampus || existingClass.schoolCampus,
        level: level || existingClass.level,
        className: className
          ? className.trim()
          : existingClass.className
      });

      if (duplicateClass) {
        return res.status(409).json({
          success: false,
          message: 'Another class with the same name already exists in this campus and level'
        });
      }
    }

    // Update allowed fields only
    if (schoolCampus) existingClass.schoolCampus = schoolCampus;
    if (level) existingClass.level = level;
    if (className) existingClass.className = className.trim();
    if (classManager !== undefined) existingClass.classManager = classManager;
    if (status) existingClass.status = status;
    if (maxStudents) existingClass.maxStudents = maxStudents;

    // Save updated class
    const updatedClass = await existingClass.save();

    return res.status(200).json({
      success: true,
      message: 'Class updated successfully',
      data: updatedClass
    });

  } catch (error) {
    console.error('❌ updateClass error:', error);

    return res.status(500).json({
      success: false,
      message: 'Server error while updating class'
    });
  }
};


/**
 * @desc    Get all classes with filters and pagination
 * @route   GET /api/classes
 * @access  Admin / Manager / Staff
 */

exports.getAllClass = async (req, res) => {
  try {
    const {
      schoolCampus,
      level,
      status,
      page = 1,
      limit = 20
    } = req.query;

    // Build filter object dynamically
    const filter = {};

    if (schoolCampus) filter.schoolCampus = schoolCampus;
    if (level) filter.level = level;
    if (status) filter.status = status;

    // Pagination values
    const pageNumber = parseInt(page, 10);
    const pageSize = parseInt(limit, 10);
    const skip = (pageNumber - 1) * pageSize;

    // Fetch classes with population
    const classes = await Class.find(filter)
      .populate('schoolCampus', 'campus_name')
      .populate('level', 'name')
      .populate('classManager', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize);

    // Count total documents for pagination
    const total = await Class.countDocuments(filter);

    return res.status(200).json({
      success: true,
      data: classes,
      pagination: {
        total,
        page: pageNumber,
        limit: pageSize,
        totalPages: Math.ceil(total / pageSize)
      }
    });

  } catch (error) {
    console.error('❌ getAllClass error:', error);

    return res.status(500).json({
      success: false,
      message: 'Server error while fetching classes'
    });
  }
};



/**
 * @desc    Get a single class by ID
 * @route   GET /api/classes/:id
 * @access  Admin / Manager / Staff
 */

exports.getClassById = async (req, res) => {
  try {
    const classId = req.params.id;

    // Validate MongoDB ObjectId
    if (!classId || !classId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid class ID'
      });
    }

    // Find class by ID and populate references
    const classData = await Class.findById(classId)
      .populate('schoolCampus', 'campus_name campus_number')
      .populate('level', 'name description')
      .populate('classManager', 'firstName lastName email phone');

    // Handle class not found
    if (!classData) {
      return res.status(404).json({
        success: false,
        message: 'Class not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: classData
    });

  } catch (error) {
    console.error('❌ getClassById error:', error);

    return res.status(500).json({
      success: false,
      message: 'Server error while fetching class'
    });
  }
};


/**
 * @desc    Get all classes for a specific campus
 * @route   GET /api/classes/campus/:campusId
 * @access  Admin / Manager / Staff
 */

exports.getClassesByCampus = async (req, res) => {
  try {
    const { campusId } = req.params;
    const { status } = req.query;

    // Validate MongoDB ObjectId
    if (!campusId || !campusId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid campus ID'
      });
    }

    // Build filter object
    const filter = {
      schoolCampus: campusId
    };

    if (status) {
      filter.status = status;
    }

    // Fetch classes belonging to the campus
    const classes = await Class.find(filter)
      .populate('level', 'name')
      .populate('classManager', 'firstName lastName email phone')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: classes
    });

  } catch (error) {
    console.error('❌ getClassesByCampus error:', error);

    return res.status(500).json({
      success: false,
      message: 'Server error while fetching campus classes'
    });
  }
};


/**
 * @desc    Get all classes managed by a specific teacher
 * @route   GET /api/classes/teacher/:teacherId
 * @access  Admin / Manager / Teacher
 */

exports.getClassesByTeacher = async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { status } = req.query;

    // Validate MongoDB ObjectId
    if (!teacherId || !teacherId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid teacher ID'
      });
    }

    // Build filter object
    const filter = {
      classManager: teacherId
    };

    if (status) {
      filter.status = status;
    }

    // Fetch classes managed by the teacher
    const classes = await Class.find(filter)
      .populate('schoolCampus', 'campus_name')
      .populate('level', 'name')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: classes
    });

  } catch (error) {
    console.error('❌ getClassesByTeacher error:', error);

    return res.status(500).json({
      success: false,
      message: 'Server error while fetching teacher classes'
    });
  }
};



/**
 * @desc    Soft delete a class (set status to archived)
 * @route   DELETE /api/classes/:id
 * @access  Admin / Manager
 */

exports.deleteClass = async (req, res) => {
  try {
    const classId = req.params.id;

    // Validate MongoDB ObjectId
    if (!classId || !classId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid class ID'
      });
    }

    // Find the class
    const existingClass = await Class.findById(classId);

    if (!existingClass) {
      return res.status(404).json({
        success: false,
        message: 'Class not found'
      });
    }

    // Check if class is already archived
    if (existingClass.status === 'archived') {
      return res.status(400).json({
        success: false,
        message: 'Class is already archived'
      });
    }

    // Soft delete: set status to archived
    existingClass.status = 'archived';
    await existingClass.save();

    return res.status(200).json({
      success: true,
      message: 'Class archived successfully'
    });

  } catch (error) {
    console.error('❌ deleteClass error:', error);

    return res.status(500).json({
      success: false,
      message: 'Server error while deleting class'
    });
  }
};


/**
 * @desc    Restore an archived class
 * @route   PATCH /api/classes/:id/restore
 * @access  Admin / Manager
 */

exports.restoreClass = async (req, res) => {
  try {
    const classId = req.params.id;

    // Validate MongoDB ObjectId
    if (!classId || !classId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid class ID'
      });
    }

    // Find the class
    const existingClass = await Class.findById(classId);

    if (!existingClass) {
      return res.status(404).json({
        success: false,
        message: 'Class not found'
      });
    }

    // Check if class is already active
    if (existingClass.status !== 'archived') {
      return res.status(400).json({
        success: false,
        message: 'Class is not archived and cannot be restored'
      });
    }

    // Restore class by setting status back to active
    existingClass.status = 'active';
    await existingClass.save();

    return res.status(200).json({
      success: true,
      message: 'Class restored successfully',
      data: existingClass
    });

  } catch (error) {
    console.error('❌ restoreClass error:', error);

    return res.status(500).json({
      success: false,
      message: 'Server error while restoring class'
    });
  }
};

