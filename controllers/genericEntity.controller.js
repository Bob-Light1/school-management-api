/** GENERIC ENTITY CONTROLLER **/

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { cleanupUploadedFile } = require('../middleware/upload/upload');
const {
  sendSuccess,
  sendError,
  sendPaginated,
  sendCreated,
  sendNotFound,
  sendConflict,
  handleDuplicateKeyError
} = require('../utils/responseHelpers');
const {
  isValidObjectId,
  isValidEmail,
  validatePasswordStrength,
  buildCampusFilter
} = require('../utils/validationHelpers');

const JWT_SECRET = process.env.JWT_SECRET;
const SALT_ROUNDS = 10;

class GenericEntityController {
  constructor(config) {
    this.Model = config.Model;
    this.entityName = config.entityName;
    this.entityNameLower = config.entityName.toLowerCase();
    this.folderName = config.folderName;
    this.searchFields = config.searchFields || ['firstName', 'lastName', 'email'];
    this.populateFields = config.populateFields || [];
    this.customValidation = config.customValidation || null;
    this.beforeCreate = config.beforeCreate || null;
    this.afterCreate = config.afterCreate || null;
    this.beforeUpdate = config.beforeUpdate || null;
    this.afterUpdate = config.afterUpdate || null;
    this.statsFacets = config.statsFacets || null;
    this.statsFormatter = config.statsFormatter || null;
    this.buildExtraFilters = config.buildExtraFilters || null;
  }

  /**
   * CREATE ENTITY
   */
  create = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const fields = req.body;
      
      const uploadedFile = req.file;
      
      const { email, username, password, ...rest } = fields;

      // Validate required fields
      if (!email || !username || !password) {
        await session.abortTransaction();
        return sendError(res, 400, 'Email, username, and password are required');
      }

      // Validate email
      if (!isValidEmail(email)) {
        await session.abortTransaction();
        return sendError(res, 400, 'Invalid email format');
      }

      // Validate password
      const passwordValidation = validatePasswordStrength(password);
      if (!passwordValidation.valid) {
        await session.abortTransaction();
        return sendError(res, 400, 'Password does not meet requirements', {
          errors: passwordValidation.errors
        });
      }

      // Check email uniqueness
      const existingEmail = await this.Model.findOne({ 
        email: email.toLowerCase() 
      }).session(session);

      if (existingEmail) {
        await session.abortTransaction();
        return sendConflict(res, 'This email is already registered');
      }

      // Check username uniqueness
      const existingUser = await this.Model.findOne({ 
        username: username.toLowerCase() 
      }).session(session);

      if (existingUser) {
        await session.abortTransaction();
        return sendConflict(res, 'This username is already taken');
      }

      // Determine campus
      let campusId;
      if (req.user.role === 'CAMPUS_MANAGER') {
        campusId = req.user.campusId;
      } else if (req.user.role === 'ADMIN' || req.user.role === 'DIRECTOR') {
        if (!fields.schoolCampus) {
          await session.abortTransaction();
          return sendError(res, 400, 'Campus ID is required');
        }
        campusId = fields.schoolCampus;
      } else {
        await session.abortTransaction();
        return sendError(res, 403, 'Not authorized to create entities');
      }

      // Custom validation
      if (this.customValidation) {
        const customValidationResult = await this.customValidation(fields, campusId, session);
        if (!customValidationResult.valid) {
          await session.abortTransaction();
          return sendError(res, 400, customValidationResult.error);
        }
      }

      // Before create hook
      if (this.beforeCreate) {
        const hookResult = await this.beforeCreate(fields, campusId, session);
        if (!hookResult.success) {
          await session.abortTransaction();
          return sendError(res, 400, hookResult.error);
        }
      }

      const profileImage = uploadedFile ? uploadedFile.path : null;

      // Hash password
      const salt = await bcrypt.genSalt(SALT_ROUNDS);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Create entity
      const entityData = { 
        ...rest, 
        email: email.toLowerCase(), 
        username: username.toLowerCase(), 
        password: hashedPassword,
        schoolCampus: campusId,
        profileImage
      };

      const entity = new this.Model(entityData);
      const savedEntity = await entity.save({ session });

      await session.commitTransaction();

      // After create hook
      if (this.afterCreate) {
        await this.afterCreate(savedEntity);
      }

      // Populate and return
      let populatedEntity = await this.Model.findById(savedEntity._id)
        .select('-password');

      for (const field of this.populateFields) {
        populatedEntity = await populatedEntity.populate(field);
      }

      populatedEntity = populatedEntity.toObject();

      return sendCreated(res, `${this.entityName} created successfully`, populatedEntity);

    } catch (error) {
      await session.abortTransaction();
      await cleanupUploadedFile(req.file);
      
      console.error(`❌ Error creating ${this.entityNameLower}:`, error);

      if (error.code === 11000) {
        return handleDuplicateKeyError(res, error);
      }

      if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(err => err.message);
        return sendError(res, 400, 'Validation failed', { errors: messages });
      }

      return sendError(res, 500, `Failed to create ${this.entityNameLower}`);
    } finally {
      session.endSession();
    }
  };

  /**
   * GET ALL ENTITIES WITH FILTERS
   */
  getAll = async (req, res) => {
    try {
      const { 
        campusId, 
        classId, 
        status, 
        search,
        limit = 50, 
        page = 1,
        includeArchived, 
      } = req.query;
      
      const filter = buildCampusFilter(req.user, campusId);
  
     if (this.buildExtraFilters) {
        const extraFilters = this.buildExtraFilters(req.query);
        Object.assign(filter, extraFilters);
      }
      
     if (includeArchived !== 'true') {
        filter.status = { $ne: 'archived' };
      }

      if (status) {
        filter.status = status;
      }
      
      if (search && this.searchFields.length > 0) {
        filter.$or = this.searchFields.map(field => ({
          [field]: { $regex: search, $options: 'i' }
        }));
      }

      const skip = (Number(page) - 1) * Number(limit);

      let query = this.Model.find(filter)
        .select('-password')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit));

     if (this.populateFields) {
        this.populateFields.forEach(field => query.populate(field));
      }

      const [entities, total] = await Promise.all([
        query.lean().exec(),
        this.Model.countDocuments(filter).exec()
      ]);;

      return sendPaginated(
        res,
        200,
        `${this.entityName}s retrieved successfully`,
        entities,
        { total, page, limit }
      );

    } catch (error) {
      console.error(`❌ Error fetching ${this.entityNameLower}s:`, error);
      return sendError(res, 500, `Failed to retrieve ${this.entityNameLower}s`);
    }
  };

  /**
   * GET ONE ENTITY BY ID
   */
  getOne = async (req, res) => {
    try {
      const { id } = req.params;

      if (!isValidObjectId(id)) {
        return sendError(res, 400, `Invalid ${this.entityNameLower} ID format`);
      }

      let entity = await this.Model.findById(id).select('-password');

      if (!entity) {
        return sendNotFound(res, this.entityName);
      }

      for (const field of this.populateFields) {
        entity = await entity.populate(field);
      }

      entity = entity.toObject();

      const isOwner = req.user?.id?.toString() === id.toString();
      const isStaff = ['ADMIN', 'CAMPUS_MANAGER', 'TEACHER', 'DIRECTOR'].includes(req.user?.role);
      
      if (!req.user) {
        return sendError(res, 401, 'Authentication required');
      }

      if (!isOwner && !isStaff) {
        return sendError(res, 403, 'Not authorized to view this profile');
      }
      
      if (isStaff && !['ADMIN', 'DIRECTOR'].includes(req.user.role)) {
        if ( entity.schoolCampus._id.toString() !== req.user.campusId.toString() ) {
          return sendError(res, 403, `This ${this.entityNameLower} does not belong to your campus`);
        }
      }

      return sendSuccess(res, 200, `${this.entityName} retrieved successfully`, entity);

    } catch (error) {
      console.error(`❌ Error fetching ${this.entityNameLower}:`, error);
      return sendError(res, 500, `Failed to retrieve ${this.entityNameLower}`);
    }
  };

  /**
   * UPDATE ENTITY
   * Migrated to Multer
   */
  update = async (req, res) => {
    try {
      const { id } = req.params;
      
      if (!isValidObjectId(id)) {
        return sendError(res, 400, `Invalid ${this.entityNameLower} ID format`);
      }

      const fields = req.body;
      const uploadedFile = req.file;
      const updates = { ...fields };

      delete updates.password;
      delete updates.schoolCampus;

      const entity = await this.Model.findById(id);
      if (!entity) {
        return sendNotFound(res, this.entityName);
      }

      // Authorization
      if (req.user.role === 'CAMPUS_MANAGER') {
        if (entity.schoolCampus.toString() !== req.user.campusId) {
          return sendError(res, 403, `Can only update ${this.entityNameLower}s from your campus`);
        }
      } else if (!['ADMIN', 'DIRECTOR'].includes(req.user.role)) {
        return sendError(res, 403, `Not authorized to update ${this.entityNameLower}s`);
      }

      // Check email uniqueness
      if (updates.email && updates.email.toLowerCase() !== entity.email) {
        if (!isValidEmail(updates.email)) {
          return sendError(res, 400, 'Invalid email format');
        }

        const emailExists = await this.Model.findOne({ 
          email: updates.email.toLowerCase(),
          _id: { $ne: id }
        });

        if (emailExists) {
          return sendConflict(res, 'This email is already in use');
        }
      }

      // Before update hook
      if (this.beforeUpdate) {
        const hookResult = await this.beforeUpdate(entity, updates);
        if (!hookResult.success) {
          return sendError(res, 400, hookResult.error);
        }
      }

      
      if (uploadedFile) {
        // Delete old image if exists
        if (entity.profileImage) {
          const { deleteFile } = require('../utils/fileUpload');
          await deleteFile(this.folderName, entity.profileImage).catch(console.error);
        }
        
        updates.profileImage = uploadedFile.path;
      }

      // Normalize
      if (updates.email) updates.email = updates.email.toLowerCase();
      if (updates.username) updates.username = updates.username.toLowerCase();

      // Update
      let updatedEntity = await this.Model.findByIdAndUpdate(
        id, 
        updates, 
        { new: true, runValidators: true }
      ).select('-password');

      for (const field of this.populateFields) {
        updatedEntity = await updatedEntity.populate(field);
      }

      updatedEntity = updatedEntity.toObject();

      // After update hook
      if (this.afterUpdate) {
        await this.afterUpdate(updatedEntity);
      }

      return sendSuccess(res, 200, `${this.entityName} updated successfully`, updatedEntity);

    } catch (error) {
      await cleanupUploadedFile(req.file);
      console.error(`❌ Error updating ${this.entityNameLower}:`, error);
      
      if (error.code === 11000) {
        return handleDuplicateKeyError(res, error);
      }

      return sendError(res, 500, `Failed to update ${this.entityNameLower}`);
    }
  };

  /**
   * ARCHIVE ENTITY (Soft Delete)
   */
  archive = async (req, res) => {
    try {
      const { id } = req.params;

      if (!isValidObjectId(id)) {
        return sendError(res, 400, `Invalid ${this.entityNameLower} ID format`);
      }

      const entity = await this.Model.findById(id);
      if (!entity) {
        return sendNotFound(res, this.entityName);
      }

      if (req.user.role === 'CAMPUS_MANAGER') {
        if (entity.schoolCampus.toString() !== req.user.campusId) {
          return sendError(res, 403, `Can only archive ${this.entityNameLower}s from your campus`);
        }
      }

      entity.status = 'archived';
      await entity.save();

      return sendSuccess(res, 200, `${this.entityName} archived successfully`);

    } catch (error) {
      console.error(`❌ Error archiving ${this.entityNameLower}:`, error);
      return sendError(res, 500, `Failed to archive ${this.entityNameLower}`);
    }
  };

  /**
   * GET STATISTICS
   */
  getStats = async (req, res) => {
    try {
      const { campusId } = req.params;

      if (!isValidObjectId(campusId)) {
        return sendError(res, 400, 'Invalid campus ID');
      }

      const startOfMonth = new Date();
      startOfMonth.setHours(0, 0, 0, 0);
      startOfMonth.setDate(1);

      const baseFacets = {
        total: [{ $count: "count" }],
        newThisMonth: [
          { $match: { createdAt: { $gte: startOfMonth } } },
          { $count: "count" }
        ]
      };

      const customFacets = this.statsFacets
        ? this.statsFacets(startOfMonth)
        : {};

      const facets = { ...baseFacets, ...customFacets };

      const statsArray = await this.Model.aggregate([
        {
          $match: {
            schoolCampus: new mongoose.Types.ObjectId(campusId),
            status: 'active'
          }
        },
        { $facet: facets }
      ]);

      const result = statsArray[0];

      const baseStats = {
        totalEntities: result.total?.[0]?.count || 0,
        newEntitiesThisMonth: result.newThisMonth?.[0]?.count || 0
      };

      const customStats = this.statsFormatter
        ? this.statsFormatter(result)
        : {};

      return sendSuccess(res, 200, 'Statistics retrieved', {
        ...baseStats,
        ...customStats
      });

    } catch (error) {
      console.error('Stats Error:', error);
      return sendError(res, 500, 'Failed to retrieve statistics');
    }
  };
}

module.exports = GenericEntityController;