import streamlit as st

# Define pages
agrisat = st.Page("agrisat.py", title="AgriSAT", icon="🌎")
agroai = st.Page("agroai.py", title="Agro AI", icon="🌱")

# Setup navigation
pg = st.navigation([agrisat, agroai])

# Run the selected page
pg.run()
