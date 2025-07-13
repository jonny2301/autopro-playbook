# 🔐 Secure OpenAI API Setup Instructions

## 1. Environment Setup

Copy the example environment file:
```bash
cp .env.example .env
```

## 2. Add Your OpenAI API Key

Edit the `.env` file and add your actual API key:
```bash
# Replace with your actual OpenAI API key
OPENAI_API_KEY=sk-your-actual-api-key-here
USE_OPENAI=true
```

## 3. Install Dependencies

```bash
npm install
```

## 4. Run the Application

```bash
npm start
```

## 🛡️ Security Notes

- **NEVER commit your `.env` file** - it's already in `.gitignore`
- Keep your API keys private
- Monitor your OpenAI usage in their dashboard
- Consider setting usage limits in OpenAI dashboard

## 📊 Usage

The AI manager will:
- Use OpenAI API when configured
- Fallback gracefully if OpenAI fails
- Track token usage
- Provide workflow analysis and optimization

## 🔄 API Switching

To switch between APIs, modify `.env`:
```bash
USE_OPENAI=true   # Use OpenAI
USE_OPENAI=false  # Use Claude (default)
```