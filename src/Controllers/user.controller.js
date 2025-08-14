// controllers/userController.js

import userModel from "../Models/users.models.js";
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// Register Controller - Now automatically logs in user after registration
export async function registerUserController(req, res) {
  try {
    const { name, email, password, mobileNo } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email, and password are required." });
    }

    const existingUser = await userModel.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "User already exists with this email." });
    }
      const existingUserName = await userModel.findOne({ name });
    if (existingUserName) {
      return res.status(400).json({ error: "User already exists with this username." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await userModel.create({
      name,
      email,
      mobileNo,
      password: hashedPassword,
      isOnline: true // Set online when registering
    });

    // Create JWT token after registration
    const token = jwt.sign(
      { id: user._id, email: user.email, name: user.name },
      process.env.SEC_KEY || "default_secret",
      { expiresIn: '7d' } // Extended to 7 days for better UX
    );

    // Set token in cookie - FIXED: Consistent settings for production
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // true in production
      sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'lax', // None for cross-origin in production
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/'
    });

    console.log("User registered and logged in:", user.name);

    res.status(201).json({
      message: "User registration and login successful",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        mobileNo: user.mobileNo
      },
      token
    });

  } catch (err) {
    console.error("Registration error:", err.message);
    res.status(500).json({ error: "Internal server error during registration" });
  }
}

// Login Controller
export async function loginUserController(req, res) {
  try {
    const { email, password } = req.body;

    // Check required fields
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required." });
    }

    // Check if user exists
    const user = await userModel.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    // Match password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    // Update user online status
    await userModel.findByIdAndUpdate(user._id, { isOnline: true });

    // Create JWT token
    const token = jwt.sign(
      { id: user._id, email: user.email, name: user.name },
      process.env.SEC_KEY || "default_secret",
      { expiresIn: "7d" } // Extended to 7 days
    );

    // Set token in cookie - FIXED: Consistent settings for production
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // true in production
      sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'lax', // None for cross-origin in production
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/'
    });

    // Send response
    res.status(200).json({
      message: "Login successful",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
      token,
    });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
}

// Example using Express.js
export const getMeController =  async(req, res) => {
  try {
    // Sample logic: verify session or JWT
    if (req.user) {
      res.status(200).json({ 
        name: req.user.name,
        id: req.user.id,
        email: req.user.email 
      });
    } else {
      res.status(401).json({ message: 'Unauthorized' });
    }
  } catch (error) {
    console.error("getMeController error:", error);
    res.status(500).json({ message: 'Internal server error' });
  }
}



export const logoutUserController = async (req, res) => {
  try {
    if (req.user?.id) {
      await userModel.findByIdAndUpdate(req.user.id, { 
        isOnline: false,
        lastSeen: new Date()
      });
    }

    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      path: '/'
    });

    res.status(200).json({
      success: true,
      message: "Logged out successfully"
    });
  } catch (error) {
    console.error("Logout error:", error.message);
    res.status(500).json({
      success: false,
      error: "Logout failed"
    });
  }
};


export async function verifyTokenMiddleware(req, res, next) {
  try {
    const token = req.cookies?.token;

    if (!token) {
      return res.status(401).json({ success: false, error: 'Access denied: No token provided' });
    }

    const decoded = jwt.verify(token, process.env.SEC_KEY || 'default_secret');
    if (!decoded.id) {
      return res.status(401).json({ success: false, error: 'Invalid token: Missing user ID' });
    }

    const user = await userModel.findById(decoded.id).select('_id name email username');
    if (!user) {
      return res.status(401).json({ success: false, error: 'User not found' });
    }

    req.user = {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      username: user.username || user.name
    };

    next();
  } catch (err) {
    console.error('Token verification error:', err);
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Token expired' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }
    return res.status(401).json({ success: false, error: 'Authentication failed' });
  }
}

// Get current user info (for the /me endpoint)
export async function getCurrentUserController(req, res) {
  try {
    const user = await userModel.findById(req.user.id)
      .select('-password') // Exclude password from response
      .lean();
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.status(200).json({
      id: user._id,
      name: user.name,
      email: user.email,
      mobileNo: user.mobileNo,
      isOnline: user.isOnline,
      lastSeen: user.lastSeen
    });
  } catch (error) {
    console.error("Error fetching current user:", error);
    res.status(500).json({ error: "Failed to fetch user data" });
  }
}

// Get all users (for chat user list)
export async function getAllUsersController(req, res) {
  try {
    const users = await userModel.find({}, 'name email isOnline lastSeen').lean();
    const usernames = users.map(user => user.name);
    res.status(200).json(usernames);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
}