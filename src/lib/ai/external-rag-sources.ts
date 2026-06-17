export const EXTERNAL_SNACK_RAG_SOURCE_TYPE = "external_snack_context";

export type ExternalSnackRagSource = {
  sourceId: string;
  title: string;
  sourceUrl: string;
  publisher: string;
  category:
    | "snacking-behavior"
    | "diet-snacking"
    | "workout-fuel"
    | "craving-response";
  tags: string[];
  content: string;
};

export const externalSnackRagSources = [
  {
    sourceId: "harvard-science-of-snacking",
    title: "Harvard Nutrition Source: The Science of Snacking",
    sourceUrl: "https://nutritionsource.hsph.harvard.edu/snacking/",
    publisher: "Harvard T.H. Chan School of Public Health",
    category: "snacking-behavior",
    tags: [
      "snack",
      "planned snack",
      "hunger",
      "energy",
      "portion",
      "mindful eating",
      "social snacking",
    ],
    content:
      "Snacking is not automatically good or bad. The stronger justification is a planned snack that responds to hunger, low energy, or a long gap between meals and still fits the overall eating pattern. Snacks with protein, fiber, whole grains, fruit, vegetables, nuts, yogurt, hummus, or popcorn are framed as more satisfying. The weaker justification is distracted grazing, stress eating, very large portions, or ultra-processed snacks that replace balanced meals without intention.",
  },
  {
    sourceId: "cleveland-clinic-before-after-workout",
    title: "Cleveland Clinic: Should You Eat Before or After a Workout?",
    sourceUrl: "https://health.clevelandclinic.org/what-to-eat-before-and-after-a-workout",
    publisher: "Cleveland Clinic",
    category: "workout-fuel",
    tags: [
      "workout",
      "fitness",
      "exercise",
      "pre workout",
      "post workout",
      "protein",
      "carbohydrate",
      "recovery",
    ],
    content:
      "Workout context can make a snack more defensible. Before exercise, a small snack with carbohydrates and some protein may help energy, especially when the workout is intense or lasts around an hour or more. After exercise, a protein-and-carbohydrate snack can be framed as recovery fuel. The case is weaker when the snack is very heavy right before exercise or unrelated to hunger, recovery, or meal timing.",
  },
  {
    sourceId: "ap-exercise-meal-timing",
    title: "AP News: When should you eat before, after, or during exercise?",
    sourceUrl: "https://apnews.com/article/14e2af96a01c594fa8ab37ebd97c5b5b",
    publisher: "Associated Press",
    category: "workout-fuel",
    tags: [
      "workout",
      "fasted exercise",
      "exercise myth",
      "carbohydrate",
      "protein",
      "recovery",
      "balanced diet",
    ],
    content:
      "The fitness snack argument should not rely on a rigid myth such as fasted exercise always being better. General eating quality matters more than dramatic timing rules. A carb-focused snack can support more demanding workouts, and protein after exercise can support recovery and appetite control, but the judgement should avoid turning one snack into medical advice or strict diet coaching.",
  },
  {
    sourceId: "health-healthy-snack-ideas",
    title: "Health.com: Healthy Snack Ideas",
    sourceUrl: "https://www.health.com/healthy-snacks-7111830",
    publisher: "Health.com",
    category: "diet-snacking",
    tags: [
      "healthy snack",
      "fiber",
      "protein",
      "portion",
      "snack planning",
      "satiety",
      "diet",
    ],
    content:
      "A snack can be treated as a bridge between meals when it includes filling elements such as fiber, protein, whole grains, healthy fats, fruit, vegetables, yogurt, nuts, hummus, eggs, or beans. The stronger case includes portion awareness and eating from a plate or bowl. The weaker case is an unplanned package-to-mouth snack that leads to more hunger or overeating.",
  },
  {
    sourceId: "real-simple-low-sugar-snacks",
    title: "Real Simple: Low-Sugar Snacks That Keep You Satisfied",
    sourceUrl: "https://www.realsimple.com/low-sugar-snacks-11976244",
    publisher: "Real Simple",
    category: "craving-response",
    tags: [
      "sweet craving",
      "low sugar",
      "stable energy",
      "protein",
      "fiber",
      "natural sweetness",
      "snack bridge",
    ],
    content:
      "Sweet cravings are not automatically a guilty verdict. The stronger argument is choosing a snack that gives a pleasant sweet signal while pairing it with protein, fiber, or healthy fats, such as yogurt with berries, hummus with vegetables, apple with nut butter, roasted chickpeas, edamame, or popcorn. A pure sugar rush is a weaker argument because it may not keep energy steady.",
  },
  {
    sourceId: "good-housekeeping-weight-loss-snacks",
    title: "Good Housekeeping: Healthy Snacks for Weight Loss",
    sourceUrl: "https://www.goodhousekeeping.com/health/diet-nutrition/g576/healthy-snacks/",
    publisher: "Good Housekeeping",
    category: "diet-snacking",
    tags: [
      "diet",
      "weight management",
      "protein",
      "fiber",
      "healthy fats",
      "snack quality",
      "diet culture",
    ],
    content:
      "Diet-related snack cases should be handled gently. Snack quality and quantity matter, but the judgement should not shame body size, calories, or dieting. A snack that includes lean protein, fiber, healthy fats, hydration, and satisfaction can be framed as a reasonable support between meals. Diet-culture guilt, punishment language, or appearance-focused reasoning should not drive the verdict.",
  },
  {
    sourceId: "verywellhealth-before-after-workout",
    title: "Verywell Health: Eat Before or After a Workout",
    sourceUrl: "https://www.verywellhealth.com/eat-before-or-after-workout-11729140",
    publisher: "Verywell Health",
    category: "workout-fuel",
    tags: [
      "workout",
      "pre workout snack",
      "post workout snack",
      "carbohydrate",
      "protein",
      "hydration",
      "recovery",
    ],
    content:
      "A workout snack is more defensible when it is timed around exercise and contains easy-to-digest carbohydrates with some protein. Post-workout snacks can be interpreted as recovery support, especially after more intense activity. The judgement should still keep this as general context, not personalized health or nutrition advice.",
  },
] satisfies ExternalSnackRagSource[];
