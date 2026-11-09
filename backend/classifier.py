
def classify_complaint(text):
    text = text.lower().strip()

    # MULTILINGUAL COMPLAINT CATEGORIES
    categories = {
        "Water Supply": [
            # English
            "water leakage", "water leak", "leaking water",
            "water pipe", "pipe burst", "water shortage",
            "no water", "water supply",

            # Kannada
            "ನೀರಿನ ಸೋರಿಕೆ", "ನೀರು ಸೋರಿಕೆ",
            "ನೀರಿನ ಕೊರತೆ", "ನೀರು ಬರುತ್ತಿಲ್ಲ",
            "ನೀರಿನ ಸಮಸ್ಯೆ", "ನೀರಿನ ಪೈಪ್",

            # Hindi
            "पानी का रिसाव", "पानी की कमी",
            "पानी नहीं आ रहा", "पानी की समस्या",
            "पाइप फट"
        ],

        "Drainage": [
            # English
            "drain", "drainage", "sewage",
            "overflowing", "blocked drain",

            # Kannada
            "ಚರಂಡಿ", "ಒಳಚರಂಡಿ",
            "ಚರಂಡಿ ನೀರು", "ಕೊಳಚೆ ನೀರು",

            # Hindi
            "नाली", "नाला", "जल निकासी",
            "सीवेज", "गंदा पानी"
        ],

        "Sanitation": [
            # English
            "garbage", "waste", "rubbish",
            "dustbin", "trash", "litter",

            # Kannada
            "ಕಸ", "ತ್ಯಾಜ್ಯ", "ಕಸದ ರಾಶಿ",
            "ಕಸ ವಿಲೇವಾರಿ", "ಕಸ ಸಂಗ್ರಹ",

            # Hindi
            "कचरा", "कूड़ा", "गंदगी",
            "कूड़ेदान", "कचरे का ढेर"
        ],

        "Roads": [
            # English
            "pothole", "potholes", "road damage",
            "broken road", "road", "street", "crack",

            # Kannada
            "ಗುಂಡಿ", "ರಸ್ತೆ", "ರಸ್ತೆಯ ಗುಂಡಿ",
            "ರಸ್ತೆ ಹಾಳಾಗಿದೆ", "ರಸ್ತೆ ಹಾನಿ",
            "ರಸ್ತೆಯಲ್ಲಿ ಬಿರುಕು",

            # Hindi
            "गड्ढा", "गड्ढे", "सड़क",
            "सड़क खराब", "टूटी सड़क",
            "सड़क में दरार"
        ]
    }

    # DETECT CATEGORY
    category = "Other"

    for name, keywords in categories.items():
        if any(keyword in text for keyword in keywords):
            category = name
            break

    # HIGH SEVERITY KEYWORDS
    high_keywords = [
    # English
    "dangerous", "accident", "accidents",
    "overflowing", "urgent", "severe",
    "major", "burst", "injury", "emergency",

    # Kannada
    "ಅಪಘಾತ", "ಅಪಾಯಕಾರಿ", "ಅಪಾಯ",
    "ತುರ್ತು", "ಗಂಭೀರ", "ಗಾಯ",
    "ಅಪಘಾತಗಳು", "ಅಪಘಾತ ಸಂಭವ",

    # Hindi
    "दुर्घटना", "खतरनाक", "खतरा",
    "आपातकाल", "गंभीर", "चोट",
    "हादसा", "हादसे",
    "बड़े-बड़े", "बड़े",
    "जल्द", "जल्दी", "तुरंत"
]

    # LOW SEVERITY KEYWORDS
    low_keywords = [
        # English
        "minor", "small", "slight",

        # Kannada
        "ಸಣ್ಣ", "ಅಲ್ಪ", "ಸ್ವಲ್ಪ",

        # Hindi
        "छोटा", "मामूली", "हल्का"
    ]

    if any(word in text for word in high_keywords):
        severity = "High"
        priority = "Urgent"

    elif any(word in text for word in low_keywords):
        severity = "Low"
        priority = "Normal"

    else:
        severity = "Medium"
        priority = "Normal"

    return {
        "category": category,
        "severity": severity,
        "priority": priority,
        "description": text
    }
