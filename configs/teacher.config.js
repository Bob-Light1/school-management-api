const Teacher = require('../models/teacher.model');
const Department = require('../models/department.model');
const mongoose = require('mongoose');

/**
 * TEACHER CONFIGURATION FOR GENERIC ENTITY CONTROLLER
 */

const teacherConfig = {
  Model: Teacher,
  entityName: 'Teacher',
  folderName: 'teachers',

  searchFields: [
    'firstName',
    'lastName',
    'email',
    'phone',
    'matricule',
    'specialization'
  ],

  populateFields: [
    { path: 'department', select: 'name description' },
    { path: 'schoolCampus', select: 'campus_name location' },
    { path: 'subjects', select: 'name code level' },
    { path: 'classes', select: 'className level' }
  ],

  /**
   * Custom validation before teacher creation
   * Validates department belongs to same campus
   */
  customValidation: async (fields, campusId, session) => {
    try {
      // Validate department if provided
      if (fields.department) {
        if (!mongoose.Types.ObjectId.isValid(fields.department)) {
          return { 
            valid: false, 
            error: 'Invalid department ID format (ObjectId expected)' 
          };
        }

        const selectedDepartment = await Department.findById(fields.department)
          .select('schoolCampus name')
          .session(session)
          .lean();

        if (!selectedDepartment) {
          return { 
            valid: false, 
            error: 'Selected department does not exist' 
          };
        }

        // Verify department belongs to the same campus
        if (selectedDepartment.schoolCampus.toString() !== campusId.toString()) {
          return {
            valid: false,
            error: `The selected department "${selectedDepartment.name}" does not belong to this campus`
          };
        }
      }

      // Validate matricule uniqueness within campus
      if (fields.matricule) {
        const existingTeacher = await Teacher.findOne({
          matricule: fields.matricule,
          schoolCampus: campusId
        })
        .select('_id')
        .session(session)
        .lean();

        if (existingTeacher) {
          return {
            valid: false,
            error: `Matricule "${fields.matricule}" is already in use in this campus`
          };
        }
      }

      // Validate employment type
      const validEmploymentTypes = ['full-time', 'part-time', 'contract', 'substitute'];
      if (fields.employmentType && !validEmploymentTypes.includes(fields.employmentType)) {
        return {
          valid: false,
          error: `Invalid employment type. Must be one of: ${validEmploymentTypes.join(', ')}`
        };
      }

      return { valid: true };

    } catch (error) {
      console.error('Teacher custom validation error:', error);
      return { 
        valid: false, 
        error: 'Error validating teacher data' 
      };
    }
  },

  /**
   * Before create hook - Teacher-specific pre-processing
   */
  beforeCreate: async (fields, campusId, session) => {
    try {
      // Auto-generate matricule if not provided
      if (!fields.matricule) {
        const teacherCount = await Teacher.countDocuments({
          schoolCampus: campusId
        }).session(session);

        const campus = await mongoose.model('Campus').findById(campusId).select('campus_number');
        const campusPrefix = campus?.campus_number || 'CAM';
        
        fields.matricule = `${campusPrefix}-TCH-${String(teacherCount + 1).padStart(4, '0')}`;
      }

      return { success: true };
    } catch (error) {
      console.error('Teacher beforeCreate error:', error);
      return { 
        success: false, 
        error: 'Failed to prepare teacher data' 
      };
    }
  },

  /**
   * After create hook - Post-creation actions
   */
  afterCreate: async (teacher) => {
    console.log(`Teacher created: ${teacher.firstName} ${teacher.lastName} (${teacher.matricule})`);
    
    // Could trigger additional actions:
    // - Send welcome email
    // - Create teacher portal account
    // - Notify department head
    // - Add to default teacher groups
  },

  /**
   * Before update hook - Validate updates
   */
  beforeUpdate: async (teacher, updates) => {
    try {
      // Prevent modification of critical fields
      delete updates._id;
      delete updates.createdAt;
      delete updates.__v;
      delete updates.password; // Password has separate update endpoint

      // Validate matricule uniqueness if being changed
      if (updates.matricule && updates.matricule !== teacher.matricule) {
        const existingTeacher = await Teacher.findOne({
          matricule: updates.matricule,
          schoolCampus: teacher.schoolCampus,
          _id: { $ne: teacher._id }
        }).select('_id');

        if (existingTeacher) {
          return {
            success: false,
            error: `Matricule "${updates.matricule}" is already in use`
          };
        }
      }

      // Validate department change
      if (updates.department && updates.department !== teacher.department?.toString()) {
        const newDepartment = await Department.findById(updates.department)
          .select('schoolCampus name');

        if (!newDepartment) {
          return {
            success: false,
            error: 'New department does not exist'
          };
        }

        if (newDepartment.schoolCampus.toString() !== teacher.schoolCampus.toString()) {
          return {
            success: false,
            error: `Department "${newDepartment.name}" does not belong to the same campus`
          };
        }
      }

      return { success: true };
    } catch (error) {
      console.error('Teacher beforeUpdate error:', error);
      return { 
        success: false, 
        error: 'Validation failed during update' 
      };
    }
  },

  /**
   * After update hook - Post-update actions
   */
  afterUpdate: async (teacher) => {
    console.log(`Teacher updated: ${teacher.firstName} ${teacher.lastName} (${teacher.matricule})`);
    
    // Could trigger:
    // - Update related classes if department changed
    // - Notify admin of critical field changes
    // - Update teacher portal permissions
  },

  /**
   * Custom statistics facets for teachers
   * Provides detailed analytics for teacher management
   */
  statsFacets: (startOfMonth) => ({
    // Distribution by department
    byDepartment: [
      {
        $lookup: {
          from: 'departments',
          localField: 'department',
          foreignField: '_id',
          as: 'departmentInfo'
        }
      },
      {
        $unwind: {
          path: '$departmentInfo',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $group: {
          _id: '$department',
          departmentName: { $first: '$departmentInfo.name' },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ],

    // Distribution by employment type
    byEmploymentType: [
      {
        $group: {
          _id: '$employmentType',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ],

    // Distribution by gender
    byGender: [
      {
        $group: {
          _id: '$gender',
          count: { $sum: 1 }
        }
      }
    ],

    // Distribution by qualification
    byQualification: [
      {
        $group: {
          _id: '$qualification',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ],

    // Recently hired (this month)
    recentlyHired: [
      {
        $match: { 
          hireDate: { $gte: startOfMonth },
          status: 'active'
        }
      },
      {
        $project: {
          firstName: 1,
          lastName: 1,
          matricule: 1,
          department: 1,
          employmentType: 1,
          hireDate: 1
        }
      },
      {
        $sort: { hireDate: -1 }
      },
      {
        $limit: 10
      }
    ],

    // Teachers without department
    withoutDepartment: [
      {
        $match: {
          department: { $exists: false },
          status: 'active'
        }
      },
      {
        $count: 'count'
      }
    ],

    // Average years of experience

    experienceStats: [
      {
        $group: {
          _id: null,
          avgExp: { $avg: '$experience' },
          minExp: { $min: '$experience' },
          maxExp: { $max: '$experience' }
        }
      }
    ],

    byRole: [
      { $unwind: '$roles' },
      { $group: { _id: '$roles', count: { $sum: 1 } } }
    ],
    // Teachers teaching multiple subjects
    multiSubjectTeachers: [
      {
        $match: {
          subjects: { $exists: true }
        }
      },
      {
        $project: {
          subjectCount: { $size: { $ifNull: ['$subjects', []] } }
        }
      },
      {
        $match: {
          subjectCount: { $gt: 1 }
        }
      },
      {
        $count: 'count'
      }
    ]
  }),

  /**
   * Format statistics output for frontend consumption
   */
  statsFormatter: (result) => {
    return {
      // Department distribution
      byDepartment: (result.byDepartment || []).map(dept => ({
        departmentId: dept._id,
        departmentName: dept.departmentName || 'Unassigned',
        count: dept.count
      })),

      // Employment type distribution
      byEmploymentType: (result.byEmploymentType || []).reduce((acc, item) => {
        const key = item._id || 'unknown';
        acc[key] = item.count;
        return acc;
      }, {}),

      // Gender distribution
      genderStats: (result.byGender || []).reduce((acc, item) => {
        const key = item._id || 'unknown';
        acc[key] = item.count;
        return acc;
      }, {}),

      // Qualification distribution
      byQualification: (result.byQualification || []).reduce((acc, item) => {
        const key = item._id || 'unknown';
        acc[key] = item.count;
        return acc;
      }, {}),

      // Recently hired teachers
      recentlyHired: result.recentlyHired || [],

      // Teachers without department
      withoutDepartment: result.withoutDepartment?.[0]?.count || 0,

      // Experience statistics

      experience: {
        average: Math.round(result.experienceStats?.[0]?.avgExp || 0),
        min: result.experienceStats?.[0]?.minExp || 0,
        max: result.experienceStats?.[0]?.maxExp || 0
      },

      rolesDistribution: (result.byRole || []).reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),

      // Multi-subject teachers count
      multiSubjectTeachers: result.multiSubjectTeachers?.[0]?.count || 0
    };
  }

};

module.exports = teacherConfig;