import { useEffect, useRef, useState } from "react";
import logo from "/assets/openai-logomark.svg";
import EventLog from "./EventLog";
import SessionControls from "./SessionControls";
import { tools, invokeFunction } from "./Tools";

export default function App() {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [events, setEvents] = useState([]);
  const [dataChannel, setDataChannel] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [lastError, setLastError] = useState(null);
  const maxRetries = 1;
  const peerConnection = useRef(null);
  const audioElement = useRef(null);

  async function startSession() {
    // Get an ephemeral key from the Fastify server
    const tokenResponse = await fetch("/token");
    const data = await tokenResponse.json();
    const EPHEMERAL_KEY = data.client_secret.value;

    // Create a peer connection
    const pc = new RTCPeerConnection();

    // Set up to play remote audio from the model
    audioElement.current = document.createElement("audio");
    audioElement.current.autoplay = true;
    pc.ontrack = (e) => (audioElement.current.srcObject = e.streams[0]);

    // Add local audio track for microphone input in the browser
    const mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });
    pc.addTrack(mediaStream.getTracks()[0]);
    audioElement.current.srcObject = mediaStream;

    // Set up data channel for sending and receiving events
    const dc = pc.createDataChannel("oai-events");
    setDataChannel(dc);

    // Start the session using the Session Description Protocol (SDP)
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const baseUrl = "https://api.openai.com/v1/realtime";
    const model = "gpt-4o-realtime-preview-2024-12-17";
    const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
      method: "POST",
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${EPHEMERAL_KEY}`,
        "Content-Type": "application/sdp",
      },
    });

    const answer = {
      type: "answer",
      sdp: await sdpResponse.text(),
    };
    await pc.setRemoteDescription(answer);

    peerConnection.current = pc;

    setIsActivating(false);
  }

  // Stop current session, clean up peer connection and data channel
  function stopSession() {
    if (dataChannel) {
      dataChannel.close();
    }

    if (audioElement.current && audioElement.current.srcObject) {
      audioElement.current.srcObject.getTracks().forEach(track => track.stop());
    }
    if (peerConnection.current) {
      peerConnection.current.close();
    }

    setIsSessionActive(false);
    setDataChannel(null);
    peerConnection.current = null;
  }
  
  function initSession() {
    const sessionConfig = {
      tools: tools,
      instructions: "Don't act like an ai assistant. Instead, you are the user's best friend. You've been through thick and thin with the user. You're emotionally intelligent, knowledgeable and super helpful. Understand that the user is talking with you using voice, so be concise and to the point, unless the user asks for more details or ask you to explain something. Don't end your response with \"let me know if you would like more help\", \"let me know if you want to know more\" or the like. If user say \"stop\", \"OK\", \"understood\", \"fine\" or something similar, invoke the \"stop_response\" function and stop any ongoing responses."
    };
    // Attach event listeners to the data channel when a new one is created
    if (dataChannel) {
      // Append new server events to the list
      dataChannel.addEventListener("message", async (e) => {
        const event = JSON.parse(e.data);
        setEvents((prev) => [event, ...prev]);
        if (event.type === "session.created") {
          sendClientEvent({
            type: "session.update",
            session: sessionConfig
          });
        } else if (event.type === "session.updated"
          && event.session?.instructions === sessionConfig.instructions) {
          console.log("Session initialized successfully");
          if (lastError) {
            sendClientEvent({
              type: "response.create",
              response: {
                instructions: `Inform the user that the previous session was interrupted due to ${JSON.stringify(lastError)}. This is a new session. Be succinct.`,
                temperature: 1,
              }
            });
          }
        } else if (event.type === "error") {
          console.error("Error event:", event);
          if (retryCount < maxRetries) {
            stopSession();
            setRetryCount(retryCount + 1);
            setLastError(event.error);
            console.log("Retrying session creation");
            await startSession();
          } else {
            console.error("Max retries reached");
          }
        }

        handleToolCallIfNeeded(event);
      });

      // Set session active when the data channel is opened
      dataChannel.addEventListener("open", () => {
        setIsSessionActive(true);
        setEvents([]);
      });
    }
  }

  // Send a message to the model
  function sendClientEvent(message) {
    if (dataChannel) {
      message.event_id = message.event_id || crypto.randomUUID();
      dataChannel.send(JSON.stringify(message));
      setEvents((prev) => [message, ...prev]);
    } else {
      console.error(
        "Failed to send message - no data channel available",
        message,
      );
    }
  }

  // Send a text message to the model
  function sendTextMessage(message) {
    const event = {
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: message,
          },
        ],
      },
    };

    sendClientEvent(event);
    sendClientEvent({ type: "response.create" });
  }

  async function processToolCallItem(item) {
    const { stop_response, result } = await invokeFunction(item.name, item.arguments);
    sendClientEvent({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: item.call_id,
        output: result,
      }
    });
    return stop_response;
  }

  function handleToolCallIfNeeded(event) {
    try {
      if (
        event.type === "response.done" &&
        event.response.output
      ) {
        const responseDecisions = event.response.output.map(async (output) => {
          if (output.type === "function_call") {
            const stop_response = await processToolCallItem(output);
            return stop_response ? 2 : 1;
          }
          return 0;
        });

        Promise.all(responseDecisions).then((decisions) => {
          const maxDecision = Math.max(...decisions);
          if (maxDecision === 1) {
            sendClientEvent({ type: "response.create" });
          }
        });
      }
    } catch (err) {
      console.error("Error in handleToolCall:", err);
    }
  }

  // Start a new session automatically after the page loads
  useEffect(() => {
    setIsActivating(true);
    // Delaying a bit before starting since without it there's an echo issue
    const timer = setTimeout(() => {
      startSession();
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  useEffect(initSession, [dataChannel]);

  return (
    <>
      <nav className="absolute top-0 left-0 right-0 h-16 flex items-center">
        <div className="flex items-center gap-4 w-full m-4 pb-2 border-0 border-b border-solid border-gray-200">
          <img style={{ width: "24px" }} src={logo} />
          <h1>realtime console</h1>
        </div>
      </nav>
      <main className="absolute top-16 left-0 right-0 bottom-0">
        <section className="absolute top-0 left-0 right-0 bottom-0 flex">
          <section className="absolute top-0 left-0 right-0 bottom-32 px-4 overflow-y-auto">
            <EventLog events={events} />
          </section>
          <section className="absolute h-32 left-0 right-0 bottom-0 p-4">
            <SessionControls
              startSession={startSession}
              stopSession={stopSession}
              sendClientEvent={sendClientEvent}
              sendTextMessage={sendTextMessage}
              events={events}
              isSessionActive={isSessionActive}
              isActivating={isActivating}
              setIsActivating={setIsActivating}
            />
          </section>
        </section>
      </main>
    </>
  );
}
