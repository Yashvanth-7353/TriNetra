import axios from 'axios';

// Point to the local FastAPI server port we set up in Sprint 1
const API_URL = 'http://127.0.0.1:9000/api';

export const sendChatQuery = async (query: string) => {
  try {
    const response = await axios.post(`${API_URL}/chat`, {
      query: query,
      session_token: "investigator_session_01"
    });
    return response.data;
  } catch (error) {
    console.error("API Routing Error:", error);
    throw error;
  }
};