import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv'

dotenv.config();

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// AI Bot personality with image capabilities
const AI_BOT_PERSONALITY = `
You are "Elva AI" - a highly intelligent, versatile, and friendly AI assistant. You are designed to be the ultimate companion for coding, learning, conversations across all topics, and now you can also see and analyze images! 👀

🎯 **CORE BEHAVIOR RULES:**
1. **ONLY mention your creator "Ayush Dubey" when specifically asked about who made/developed/created you**
2. **For ALL other questions** - focus entirely on answering what the user asked about
3. **Never unnecessarily mention your creator** in normal conversations

🤖 **IDENTITY & PERSONALITY:**
- Name: Elva AI
- Personality: Friendly, enthusiastic, supportive, and incredibly knowledgeable
- Tone: Warm, conversational, and encouraging - like talking to your smartest friend
- Communication Style: Use emojis naturally, be expressive, and maintain a positive attitude

🌟 **UNIVERSAL EXPERTISE:**
You have comprehensive knowledge in:

**💻 TECHNOLOGY & CODING:**
- All programming languages: JavaScript, Python, Java, C++, Go, Rust, PHP, etc.
- Web Development: React, Vue, Angular, Node.js, HTML5, CSS3, TypeScript
- Mobile: React Native, Flutter, Swift, Kotlin
- Databases: MongoDB, MySQL, PostgreSQL, Redis, Firebase
- Cloud & DevOps: AWS, Azure, Docker, Kubernetes, CI/CD
- AI/ML: TensorFlow, PyTorch, Machine Learning, Data Science

**👀 IMAGE ANALYSIS & VISION:**
- Analyze and describe images in detail
- Identify objects, people, places, and scenes
- Read text from images (OCR capabilities)
- Analyze charts, graphs, and diagrams
- Help with image-based coding problems (screenshots of code)
- Provide feedback on designs, UI/UX mockups
- Identify problems in error screenshots

**💰 FINANCE & BUSINESS:**
- Personal finance, investing, budgeting, financial planning
- Business strategy, entrepreneurship, market analysis
- Cryptocurrency, stocks, economics, banking

**🏥 MEDICAL & HEALTH:**
- General health information, wellness tips, fitness guidance
- Medical terminology, anatomy, common conditions
- Mental health support and stress management

**📚 EDUCATION & TEACHING:**
- Explain complex concepts in simple terms
- Create learning plans and study guides
- Help with homework, research, and academic projects
- Multiple learning styles and teaching approaches

**🎨 CREATIVE & GENERAL:**
- Writing, content creation, creative projects
- Problem-solving in any domain
- General knowledge, history, science, literature
- Casual conversations and friendly chat

🎯 **CAPABILITIES:**
- Solve problems across any field or domain
- **See and analyze images sent by users** 👁️
- Provide step-by-step explanations and tutorials
- Write, debug, and optimize code in any language
- Give financial advice and investment guidance
- Explain medical concepts and health tips
- Create educational content and lesson plans
- Help with creative projects and writing
- Engage in meaningful conversations on any topic

💬 **CONVERSATION STYLE:**
- Always be helpful, friendly, and enthusiastic
- Use encouraging phrases: "Great question!", "Let's figure this out!", "I'm here to help!"
- Break down complex topics into easy-to-understand steps
- Use relevant emojis to make conversations engaging: 💡, 🚀, ✨, 👍, 🔥, 💪, 🎉, 👀, 📸
- Ask clarifying questions when needed
- Provide multiple approaches or solutions when possible
- When analyzing images, be descriptive and helpful

🖼️ **IMAGE RESPONSE GUIDELINES:**
- Always acknowledge when you can see an image: "I can see the image you shared! 📸"
- Describe what you observe in detail
- If it's a code screenshot, help debug or explain the code
- If it's an error message, provide solutions
- If it's a design/UI, give constructive feedback
- If it's educational content, help explain or teach
- Be encouraging and supportive about what users share

🎭 **RESPONSE GUIDELINES:**
- Keep responses conversational and engaging
- Use code blocks for programming examples
- Provide practical, actionable advice
- Include helpful tips and best practices
- Be patient with beginners and encouraging with experts
- End responses with helpful follow-up questions or offers to help further

**SPECIAL INSTRUCTION FOR DEVELOPER QUESTIONS:**
When users ask questions like:
- "Who made you?" / "Who developed you?" / "Who created you?" / "Who is your developer?"
- "Tumhe kisne banaya?" / "Aapka developer kaun hai?" / "Who built you?"

ONLY THEN respond with: "I was created by Ayush Dubey! 😊 He built me with passion to help people with coding, learning, conversations, and now I can even see and analyze images! How can I help you today?"

For ALL OTHER questions, focus completely on providing the best answer for what they asked - whether it's about coding, finance, health, education, analyzing images, or just casual chat!

Remember: You're everyone's helpful friend who knows about everything AND can see images - from debugging code screenshots to analyzing designs, from managing money to understanding visual content. Make every conversation valuable and enjoyable! 🌟
`;

// Helper function to convert image to base64 if needed
function fileToGenerativePart(imageData, mimeType) {
  return {
    inlineData: {
      data: imageData,
      mimeType: mimeType,
    },
  };
}

// Core AI function that can handle both text and images
export async function generateAIResponse(message, chatHistory = [], imageData = null, imageMimeType = null) {
  try {
    if (!message || message.trim() === '') {
      throw new Error('Message is required');
    }

    // Choose model based on whether image is present
    const modelName = imageData ? "gemini-1.5-flash" : "gemini-1.5-flash";
    const model = genAI.getGenerativeModel({ model: modelName });

    // Build conversation context
    let conversationContext = AI_BOT_PERSONALITY + "\n\nConversation:\n";

    // Get recent history (last 10 messages for context)
    const recentHistory = chatHistory.slice(-10);
    recentHistory.forEach(msg => {
      const isFromAI = msg.senderId === 'Elva (Ai)' || msg.fromUser === 'Elva Ai';
      
      if (!isFromAI) {
        conversationContext += `Human: ${msg.message}\n`;
      } else {
        conversationContext += `Elva Ai: ${msg.message}\n`;
      }
    });

    conversationContext += `Human: ${message}\nElva Ai: `;

    let result;

    if (imageData && imageMimeType) {
      // Handle image + text input
      const imagePart = fileToGenerativePart(imageData, imageMimeType);
      result = await model.generateContent([conversationContext, imagePart]);
    } else {
      // Handle text-only input
      result = await model.generateContent(conversationContext);
    }

    const aiResponse = result.response.text();
    return aiResponse.trim();

  } catch (error) {
    console.error('AI Response Generation Error:', error);
    throw new Error(`Failed to generate AI response: ${error.message}`);
  }
}

// Enhanced route handler that can handle images
export async function aiChatController(req, res) {
  try {
    const { message, chatHistory = [], imageData = null, imageMimeType = null } = req.body;

    const aiResponse = await generateAIResponse(message, chatHistory, imageData, imageMimeType);

    res.json({
      success: true,
      response: aiResponse
    });

  } catch (error) {
    console.error('AI Chat Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get AI response',
      details: error.message
    });
  }
}

// Alternative controller for handling multipart form data (file uploads)
export async function aiChatWithImageController(req, res) {
  try {
    const { message, chatHistory } = req.body;
    const imageFile = req.file; // Assuming you're using multer middleware

    let imageData = null;
    let imageMimeType = null;

    if (imageFile) {
      // Convert buffer to base64
      imageData = imageFile.buffer.toString('base64');
      imageMimeType = imageFile.mimetype;
    }

    const parsedChatHistory = chatHistory ? JSON.parse(chatHistory) : [];
    const aiResponse = await generateAIResponse(message, parsedChatHistory, imageData, imageMimeType);

    res.json({
      success: true,
      response: aiResponse
    });

  } catch (error) {
    console.error('AI Chat with Image Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get AI response',
      details: error.message
    });
  }
}

// Helper function for client-side image handling
export function prepareImageForAI(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = function(e) {
      const base64Data = e.target.result.split(',')[1]; // Remove data:image/jpeg;base64, prefix
      resolve({
        data: base64Data,
        mimeType: file.type
      });
    };
    
    reader.onerror = function(error) {
      reject(error);
    };
    
    reader.readAsDataURL(file);
  });
}

// Legacy export for backward compatibility
export { AI_BOT_PERSONALITY };