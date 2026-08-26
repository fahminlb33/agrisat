import streamlit as st
from agroai_api import get_agent
from haystack import tracing
from haystack.dataclasses import ChatMessage
from haystack.tracing.logging_tracer import LoggingTracer

tracing.tracer.is_content_tracing_enabled = True
tracing.enable_tracing(LoggingTracer())


@st.cache_resource
def get_cached_agent(key: str, model: str):
    return get_agent(key, model)


def persist_gemini_key():
    st.session_state["gemini_key"] = st.session_state["_gemini_key"]


if "chat_history" not in st.session_state:
    st.session_state.chat_history = []
    st.session_state.prompt_tokens = 0
    st.session_state.completion_tokens = 0
    st.session_state.total_tokens = 0

if "gemini_key" not in st.session_state:
    st.session_state.gemini_key = ""

# ----------------------------------------------
# Sidebar
# ----------------------------------------------

with st.sidebar:
    st.header("Settings")

    gemini_key = st.text_input(
        "Gemini API Key",
        type="password",
        value=st.session_state["gemini_key"],
        key="_gemini_key",
        on_change=persist_gemini_key,
    )

    gemini_model = st.selectbox(
        "Gemini Model",
        [
            "gemini-3.5-flash-lite",
            "gemini-3.5-flash",
            "gemini-3.6-flash",
            "gemini-3.7-flash",
        ],
        key="gemini_model",
    )

    st.subheader("Statistik")

    if "total_tokens" in st.session_state:
        st.table(
            {
                "Prompt tokens": f"{st.session_state.prompt_tokens}",
                "Completion tokens": f"{st.session_state.completion_tokens}",
                "Total tokens": f":green[{st.session_state.total_tokens}]",
            },
            border="horizontal",
        )


# ----------------------------------------------
# Chatbot
# ----------------------------------------------

st.title("Agro AI Chatbot🌱")
st.text(
    "Selamat datang pada Agro AI Precision Agriculture chatbot! Anda bisa bertanya seputar pertanian dan data yang terdapat pada sistem AgriSAT, lho!"
)

for message in st.session_state.chat_history:
    with st.chat_message(message["role"]):
        st.write(message["content"])

if prompt := st.chat_input("Say something to the fragment bot..."):
    if not gemini_key or not gemini_model:
        st.toast("API Key atau Model belum diisi!")
    else:
        # save user prompt
        with st.chat_message("user"):
            st.write(prompt)

        st.session_state.chat_history.append({"role": "user", "content": prompt})

        # call AI
        agent = get_cached_agent(gemini_key, gemini_model)
        result = agent.run(messages=[ChatMessage.from_user(prompt)])
        response = result["messages"][-1].text
        st.session_state.prompt_tokens += result["token_usage"]["prompt_tokens"]
        st.session_state.completion_tokens += result["token_usage"]["completion_tokens"]
        st.session_state.total_tokens += result["token_usage"]["total_tokens"]

        # save bot response
        with st.chat_message("assistant"):
            st.write(response)

        st.session_state.chat_history.append({"role": "assistant", "content": response})
