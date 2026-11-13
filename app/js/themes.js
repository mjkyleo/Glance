// Glance thematic classification: organize the word library into topic clusters for
// focused study (专项学习). Hybrid classifier — closed word lists for enumerable sets
// (days/months/numbers/colors/festivals/family/body/sports) plus concise Chinese +
// English keyword matching. English definitions are WordNet-style taxonomic glosses,
// so they give high precision for concrete domains (animals/plants/food). Chinese
// keywords are multi-character and domain-specific to avoid false positives. A word
// may belong to several themes.
(function () {
  const GROUPS = [
    { id: 'exam', name: '考试专项' },
    { id: 'nature', name: '自然与生命' },
    { id: 'life', name: '生活与社会' },
    { id: 'econ', name: '经济与科技' },
    { id: 'basic', name: '语言与基础' }
  ];

  // Each theme: { id, name, group, desc, words?:[exact], zh?:[中文关键词], en?:[英文释义关键词], composite?, cet? }
  const THEMES = [
    // ---------- 考试专项 ----------
    { id: 'culture', name: '中国传统文化', group: 'exam', desc: '节日·哲学·艺术·工艺·历史，翻译作文高频特色话题',
      words: ['confucius', 'confucian', 'confucianism', 'taoism', 'taoist', 'buddhism', 'buddhist', 'dynasty', 'porcelain', 'calligraphy', 'acupuncture', 'fengshui', 'kungfu', 'silk', 'lunar', 'lantern', 'dumpling', 'tai-chi', 'chinese', 'tradition', 'traditional', 'custom', 'heritage', 'folklore', 'myth', 'legend', 'ritual', 'ceremony', 'ancestor', 'worship', 'temple', 'shrine', 'pagoda', 'palace', 'tomb', 'embroidery', 'pottery', 'jade', 'bronze', 'antique', 'relic', 'artifact', 'philosophy', 'ethics', 'doctrine', 'taboo', 'superstition', 'descendant', 'lineage', 'ethnic', 'folk', 'handicraft', 'excavation', 'scripture', 'monk', 'meditation', 'pilgrim', 'pilgrimage', 'opera', 'costume', 'cuisine', 'chopsticks', 'tea', 'festival', 'holiday', 'civilization', 'moral', 'virtue', 'harmony', 'benevolence', 'filial', 'province', 'dragon', 'phoenix', 'surname', 'clan', 'dynastic', 'imperial', 'emperor', 'calligrapher', 'lacquer', 'cloisonne', 'sculpture', 'engraving', 'ink', 'brush', 'scroll', 'canal', 'courtyard', 'garden'],
      zh: ['儒家', '道家', '道教', '佛教', '禅宗', '朝代', '王朝', '瓷器', '陶瓷', '丝绸', '书法', '针灸', '风水', '功夫', '武术', '孔子', '老子', '庄子', '孟子', '唐诗', '宋词', '京剧', '中医', '中药', '剪纸', '对联', '春联', '生肖', '农历', '国学', '传统', '节日', '庙会', '舞狮', '太极', '茶道', '围棋', '文化', '文明', '遗产', '习俗', '风俗', '民间', '神话', '传说', '祖先', '祭祀', '寺庙', '宫殿', '雕刻', '刺绣', '哲学', '伦理', '朝代', '文物', '古迹', '经典', '典籍', '诗词', '戏曲', '园林', '胡同', '四合院', '灯笼', '玉器', '青铜'],
      en: ['confucian', 'confucius', 'taoism', 'taoist', 'buddhism', 'buddhist', 'dynasty', 'porcelain', 'calligraphy', 'acupuncture', 'fengshui', 'kungfu', 'martial arts', 'chinese', 'heritage', 'folklore', 'civilization', 'ancestor', 'pilgrimage', 'embroidery', 'handicraft'] },
    { id: 'cet_trans', name: '四六级翻译常考', group: 'exam', desc: '文化·历史·地理·经济·社会发展等翻译段落高频话题（四六级词）',
      composite: ['culture', 'history', 'nature', 'economy', 'society', 'education', 'environment'], cet: true },
    { id: 'cet_write', name: '四六级作文常考', group: 'exam', desc: '教育·科技·环境·健康·社会·文化等议论文高频话题（四六级词）',
      composite: ['education', 'tech', 'environment', 'health', 'society', 'economy', 'culture', 'emotion'], cet: true },

    // ---------- 自然与生命 ----------
    { id: 'animal', name: '动物', group: 'nature', desc: '走兽·飞禽·水族·昆虫',
      words: ['animal', 'dog', 'cat', 'pig', 'cow', 'ox', 'bull', 'sheep', 'goat', 'horse', 'donkey', 'mule', 'camel', 'elephant', 'lion', 'tiger', 'leopard', 'cheetah', 'bear', 'wolf', 'fox', 'deer', 'rabbit', 'hare', 'mouse', 'rat', 'squirrel', 'monkey', 'ape', 'gorilla', 'chimpanzee', 'panda', 'koala', 'kangaroo', 'sloth', 'hippopotamus', 'rhinoceros', 'giraffe', 'zebra', 'buffalo', 'bison', 'antelope', 'gazelle', 'seal', 'walrus', 'dolphin', 'whale', 'shark', 'fish', 'salmon', 'trout', 'eel', 'octopus', 'squid', 'crab', 'lobster', 'shrimp', 'prawn', 'oyster', 'clam', 'snail', 'slug', 'worm', 'insect', 'bee', 'wasp', 'ant', 'butterfly', 'moth', 'beetle', 'fly', 'mosquito', 'spider', 'scorpion', 'bird', 'eagle', 'hawk', 'falcon', 'owl', 'sparrow', 'crow', 'raven', 'pigeon', 'dove', 'parrot', 'peacock', 'swan', 'duck', 'goose', 'chicken', 'rooster', 'hen', 'turkey', 'penguin', 'ostrich', 'frog', 'toad', 'lizard', 'snake', 'turtle', 'tortoise', 'crocodile', 'dinosaur'],
      zh: ['动物', '哺乳', '鸟类', '爬虫', '爬行', '两栖', '昆虫', '鱼类', '家畜', '家禽', '野兽', '飞禽', '走兽', '宠物'],
      en: ['mammal', 'bird', 'reptile', 'amphibian', 'insect', 'arachnid', 'crustacean', 'mollusk', 'primate', 'rodent', 'carnivore', 'herbivore', 'marsupial', 'canine', 'feline', 'bovine', 'equine', 'porcine', 'poultry', 'livestock', 'vertebrate', 'invertebrate', 'predator', 'prey'] },
    { id: 'plant', name: '植物', group: 'nature', desc: '花草·树木·蔬果·作物',
      words: ['plant', 'flower', 'rose', 'lily', 'tulip', 'daisy', 'orchid', 'sunflower', 'violet', 'lotus', 'tree', 'oak', 'pine', 'maple', 'willow', 'birch', 'bamboo', 'palm', 'cedar', 'bush', 'shrub', 'fern', 'moss', 'grass', 'weed', 'cactus', 'ivy', 'vine', 'herb', 'mushroom', 'fungus', 'algae', 'seaweed', 'crop', 'wheat', 'rice', 'corn', 'barley', 'oat', 'cotton', 'soybean', 'vegetable', 'fruit', 'apple', 'pear', 'peach', 'plum', 'cherry', 'grape', 'orange', 'lemon', 'banana', 'mango', 'berry', 'strawberry', 'seed', 'sprout', 'root', 'stem', 'leaf', 'petal', 'branch', 'trunk', 'bark', 'pollen', 'nectar'],
      zh: ['植物', '树木', '花卉', '花朵', '鲜花', '花瓣', '草坪', '草地', '杂草', '灌木', '藤本', '苔藓', '蕨类', '真菌', '藻类', '农作物', '庄稼', '作物', '种子', '发芽', '树叶', '树枝', '树干', '树皮', '花粉', '花蜜', '根茎'],
      en: ['plant', 'tree', 'flower', 'shrub', 'herb', 'fern', 'moss', 'fungus', 'vegetation', 'foliage', 'botanical', 'botany', 'photosynthesis', 'chlorophyll', 'pollinate', 'blossom', 'sprout', 'seedling'] },
    { id: 'nature', name: '自然地理', group: 'nature', desc: '山川河海·天气气候·自然现象',
      words: ['mountain', 'hill', 'valley', 'canyon', 'cliff', 'peak', 'volcano', 'glacier', 'river', 'stream', 'lake', 'pond', 'ocean', 'sea', 'bay', 'gulf', 'coast', 'shore', 'beach', 'island', 'peninsula', 'desert', 'forest', 'jungle', 'swamp', 'marsh', 'meadow', 'prairie', 'plain', 'plateau', 'cave', 'waterfall', 'rain', 'snow', 'storm', 'thunder', 'lightning', 'hurricane', 'typhoon', 'tornado', 'earthquake', 'flood', 'drought', 'fog', 'mist', 'rainbow', 'wind', 'breeze', 'cloud'],
      zh: ['山脉', '山谷', '峡谷', '悬崖', '火山', '冰川', '河流', '湖泊', '海洋', '海岸', '岛屿', '半岛', '沙漠', '森林', '丛林', '沼泽', '草原', '平原', '高原', '洞穴', '瀑布', '天气', '气候', '风暴', '雷电', '飓风', '台风', '龙卷风', '地震', '洪水', '干旱', '雾', '彩虹', '自然现象', '地理'],
      en: ['mountain', 'valley', 'canyon', 'glacier', 'volcano', 'river', 'lake', 'ocean', 'coast', 'island', 'peninsula', 'desert', 'forest', 'jungle', 'swamp', 'meadow', 'plateau', 'waterfall', 'weather', 'climate', 'storm', 'hurricane', 'tornado', 'earthquake', 'flood', 'drought', 'atmosphere', 'geography', 'geological', 'terrain'] },
    { id: 'body', name: '身体部位', group: 'nature', desc: '器官·肢体·感官',
      words: ['body', 'head', 'face', 'eye', 'ear', 'nose', 'mouth', 'lip', 'tooth', 'tongue', 'chin', 'cheek', 'forehead', 'neck', 'throat', 'shoulder', 'arm', 'elbow', 'wrist', 'hand', 'finger', 'thumb', 'palm', 'fist', 'chest', 'back', 'waist', 'hip', 'leg', 'thigh', 'knee', 'ankle', 'foot', 'toe', 'heel', 'skin', 'bone', 'muscle', 'nerve', 'vein', 'artery', 'blood', 'heart', 'lung', 'liver', 'kidney', 'stomach', 'intestine', 'brain', 'spine', 'skull', 'rib', 'joint', 'tissue', 'organ'],
      zh: ['身体', '器官', '肢体', '肌肉', '骨骼', '骨头', '神经', '血管', '静脉', '动脉', '血液', '心脏', '肝脏', '肾脏', '肺部', '胃', '肠道', '大脑', '脊柱', '头骨', '关节', '组织', '眼睛', '耳朵', '鼻子', '口腔', '牙齿', '舌头', '手指', '脚趾', '皮肤', '解剖'],
      en: ['organ', 'limb', 'muscle', 'bone', 'nerve', 'tissue', 'skeletal', 'anatomy', 'anatomical', 'bodily', 'artery', 'vein', 'digestive', 'respiratory', 'circulatory', 'sensory'] },
    { id: 'food', name: '食物饮食', group: 'nature', desc: '食材·菜肴·饮品·烹饪',
      words: ['food', 'bread', 'rice', 'noodle', 'pasta', 'meat', 'beef', 'pork', 'mutton', 'chicken', 'fish', 'egg', 'milk', 'cheese', 'butter', 'cream', 'yogurt', 'sugar', 'salt', 'pepper', 'oil', 'flour', 'soup', 'salad', 'sandwich', 'pizza', 'cake', 'cookie', 'biscuit', 'pie', 'dessert', 'chocolate', 'candy', 'honey', 'jam', 'sauce', 'vinegar', 'coffee', 'tea', 'juice', 'wine', 'beer', 'soda', 'water', 'breakfast', 'lunch', 'dinner', 'supper', 'snack', 'meal', 'dish', 'recipe', 'ingredient', 'nutrition', 'diet', 'cook', 'bake', 'boil', 'fry', 'roast', 'grill', 'steam'],
      zh: ['食物', '食品', '饮食', '菜肴', '烹饪', '烹调', '烘焙', '食材', '食谱', '营养', '膳食', '饮料', '饮品', '水果', '蔬菜', '肉类', '乳制', '谷物', '面粉', '零食', '甜点', '早餐', '午餐', '晚餐', '调料', '酱汁'],
      en: ['food', 'edible', 'meal', 'dish', 'cuisine', 'culinary', 'cook', 'cooking', 'bake', 'roast', 'boil', 'fry', 'grill', 'ingredient', 'recipe', 'nutrition', 'diet', 'beverage', 'dairy', 'grain', 'dessert', 'snack', 'seasoning', 'spice'] },

    // ---------- 生活与社会 ----------
    { id: 'home', name: '家居生活', group: 'life', desc: '家具·家电·日用·起居',
      words: ['home', 'house', 'furniture', 'table', 'desk', 'chair', 'stool', 'bench', 'sofa', 'couch', 'bed', 'mattress', 'pillow', 'blanket', 'quilt', 'sheet', 'curtain', 'carpet', 'rug', 'mat', 'lamp', 'light', 'mirror', 'shelf', 'cabinet', 'cupboard', 'wardrobe', 'closet', 'drawer', 'door', 'window', 'wall', 'floor', 'ceiling', 'stair', 'roof', 'kitchen', 'bedroom', 'bathroom', 'toilet', 'towel', 'soap', 'brush', 'comb', 'broom', 'bucket', 'basket', 'fridge', 'refrigerator', 'oven', 'stove', 'microwave', 'kettle', 'toaster', 'washer', 'dryer', 'vacuum', 'fan', 'heater', 'air-conditioner'],
      zh: ['家具', '家电', '家居', '厨房', '卧室', '浴室', '客厅', '家用', '日用', '起居', '窗帘', '地毯', '枕头', '毯子', '橱柜', '衣柜', '书架', '镜子', '冰箱', '烤箱', '微波炉', '洗衣机', '吸尘器', '电扇', '暖气', '马桶', '毛巾', '肥皂', '扫帚'],
      en: ['furniture', 'household', 'appliance', 'kitchen', 'bedroom', 'bathroom', 'furnish', 'domestic', 'utensil', 'tableware', 'crockery', 'cutlery', 'mattress', 'cushion', 'wardrobe', 'cupboard', 'cabinet'] },
    { id: 'family', name: '家庭亲属', group: 'life', desc: '家人·亲属·称谓',
      words: ['family', 'father', 'dad', 'mother', 'mom', 'parent', 'son', 'daughter', 'child', 'brother', 'sister', 'sibling', 'uncle', 'aunt', 'cousin', 'nephew', 'niece', 'grandfather', 'grandmother', 'grandson', 'granddaughter', 'grandparent', 'husband', 'wife', 'spouse', 'partner', 'relative', 'kin', 'ancestor', 'descendant', 'offspring', 'marriage', 'marry', 'divorce', 'wedding', 'bride', 'groom', 'baby', 'infant', 'twin', 'guardian', 'household'],
      zh: ['家庭', '家人', '亲属', '亲戚', '父亲', '母亲', '父母', '儿子', '女儿', '兄弟', '姐妹', '叔伯', '舅舅', '姑妈', '姨妈', '堂兄', '表亲', '侄子', '侄女', '祖父', '祖母', '孙子', '孙女', '丈夫', '妻子', '配偶', '婚姻', '结婚', '离婚', '婚礼', '祖先', '后裔', '亲属关系'],
      en: ['family', 'relative', 'kin', 'parent', 'sibling', 'spouse', 'marriage', 'marital', 'ancestor', 'descendant', 'offspring', 'kinship', 'household', 'guardian', 'wedding', 'bride', 'groom'] },
    { id: 'emotion', name: '情感心理', group: 'life', desc: '情绪·感受·性格·心理',
      words: ['happy', 'sad', 'angry', 'fear', 'afraid', 'love', 'hate', 'joy', 'sorrow', 'grief', 'delight', 'pleasure', 'anxiety', 'anxious', 'worry', 'stress', 'depression', 'excited', 'excitement', 'calm', 'nervous', 'jealous', 'envy', 'proud', 'pride', 'shame', 'guilt', 'regret', 'hope', 'despair', 'disappoint', 'surprise', 'confuse', 'embarrass', 'lonely', 'loneliness', 'confidence', 'courage', 'frustration', 'anger', 'disgust', 'sympathy', 'empathy', 'passion', 'mood', 'temper', 'personality', 'temperament'],
      zh: ['情绪', '情感', '感情', '心情', '感受', '激情', '热情', '愤怒', '恐惧', '喜悦', '悲伤', '快乐', '幸福', '悲痛', '焦虑', '绝望', '希望', '嫉妒', '自豪', '羞耻', '内疚', '后悔', '同情', '共情', '性格', '气质', '心理', '情绪化', '沮丧', '孤独'],
      en: ['emotion', 'emotional', 'feeling', 'mood', 'sentiment', 'passion', 'affection', 'anger', 'fear', 'joy', 'sadness', 'happiness', 'grief', 'anxiety', 'despair', 'envy', 'jealousy', 'pride', 'shame', 'guilt', 'sympathy', 'empathy', 'personality', 'temperament', 'psychological', 'psychology', 'mental', 'temper'] },
    { id: 'education', name: '教育学习', group: 'life', desc: '学校·课程·考试·学术',
      words: ['education', 'school', 'university', 'college', 'academy', 'campus', 'student', 'pupil', 'teacher', 'professor', 'lecturer', 'tutor', 'learn', 'teach', 'study', 'course', 'class', 'lesson', 'lecture', 'seminar', 'curriculum', 'syllabus', 'exam', 'examination', 'test', 'quiz', 'homework', 'assignment', 'essay', 'thesis', 'degree', 'diploma', 'scholarship', 'tuition', 'graduation', 'graduate', 'semester', 'term', 'academic', 'knowledge', 'literacy', 'intelligence', 'wisdom'],
      zh: ['教育', '学校', '大学', '学院', '校园', '学生', '教师', '老师', '教授', '教学', '学习', '课程', '课堂', '考试', '测验', '学术', '奖学金', '学位', '文凭', '毕业', '学费', '作业', '讲座', '学期', '院系', '知识', '识字', '智力', '智慧'],
      en: ['education', 'educational', 'school', 'university', 'college', 'academic', 'curriculum', 'pedagogy', 'scholarship', 'literacy', 'lecture', 'semester', 'campus', 'faculty', 'tuition', 'diploma', 'graduate'] },
    { id: 'health', name: '医疗健康', group: 'life', desc: '疾病·诊疗·药物·保健',
      words: ['health', 'healthy', 'disease', 'illness', 'sickness', 'symptom', 'pain', 'fever', 'cough', 'cold', 'flu', 'infection', 'virus', 'bacteria', 'germ', 'wound', 'injury', 'cancer', 'tumor', 'diabetes', 'asthma', 'allergy', 'obesity', 'doctor', 'physician', 'surgeon', 'nurse', 'dentist', 'patient', 'hospital', 'clinic', 'pharmacy', 'medicine', 'drug', 'pill', 'tablet', 'vaccine', 'injection', 'surgery', 'operation', 'therapy', 'treatment', 'diagnosis', 'prescription', 'remedy', 'cure', 'heal', 'recover', 'hygiene'],
      zh: ['疾病', '患病', '医疗', '医学', '医药', '健康', '保健', '诊断', '治疗', '疗法', '症状', '治愈', '病人', '患者', '医院', '诊所', '临床', '手术', '疫苗', '接种', '处方', '药物', '药品', '制药', '流行病', '传染', '感染', '病毒', '细菌', '免疫', '营养', '综合征', '慢性', '急性', '医生', '医师', '护士', '牙医', '药房', '剂量', '康复', '残疾', '肥胖', '糖尿病', '癌症', '肿瘤', '过敏', '哮喘'],
      en: ['disease', 'illness', 'sickness', 'medical', 'medicine', 'health', 'healthcare', 'diagnosis', 'diagnose', 'treatment', 'therapy', 'therapeutic', 'symptom', 'cure', 'patient', 'hospital', 'clinic', 'clinical', 'surgery', 'surgical', 'vaccine', 'vaccination', 'prescription', 'drug', 'medication', 'pharmaceutical', 'epidemic', 'pandemic', 'infection', 'virus', 'bacteria', 'immune', 'immunity', 'nutrition', 'wellness', 'disorder', 'syndrome', 'chronic', 'acute', 'physician', 'nurse', 'dentist', 'pharmacy', 'dose', 'remedy', 'heal', 'rehabilitation', 'disability', 'obesity', 'diabetes', 'cancer', 'tumor', 'allergy', 'asthma'] },
    { id: 'transport', name: '交通出行', group: 'life', desc: '车辆·道路·航运·航空',
      words: ['transport', 'traffic', 'car', 'bus', 'truck', 'lorry', 'van', 'taxi', 'cab', 'train', 'subway', 'metro', 'tram', 'bicycle', 'bike', 'motorcycle', 'scooter', 'airplane', 'plane', 'aircraft', 'jet', 'helicopter', 'ship', 'boat', 'ferry', 'vessel', 'yacht', 'road', 'street', 'highway', 'freeway', 'lane', 'bridge', 'tunnel', 'intersection', 'crossing', 'sidewalk', 'pavement', 'railway', 'railroad', 'station', 'airport', 'port', 'harbor', 'garage', 'parking', 'route', 'journey', 'travel', 'trip', 'voyage', 'commute'],
      zh: ['交通', '运输', '车辆', '汽车', '公交', '火车', '铁路', '公路', '道路', '高速', '地铁', '出租', '航空', '飞机', '航班', '机场', '航运', '船舶', '导航', '航行', '旅行', '出行', '通勤', '行人', '路口', '车道', '路线', '车站', '港口', '隧道', '桥梁'],
      en: ['vehicle', 'transport', 'transportation', 'traffic', 'road', 'highway', 'railway', 'railroad', 'transit', 'commute', 'aviation', 'flight', 'airline', 'airport', 'shipping', 'navigation', 'voyage', 'journey', 'travel', 'pedestrian', 'intersection', 'lane', 'route', 'harbor', 'vessel'] },
    { id: 'sports', name: '体育运动', group: 'life', desc: '球类·田径·水上·健身',
      words: ['sport', 'sports', 'football', 'soccer', 'basketball', 'baseball', 'tennis', 'golf', 'volleyball', 'badminton', 'cricket', 'rugby', 'hockey', 'swimming', 'diving', 'surfing', 'rowing', 'sailing', 'boxing', 'wrestling', 'judo', 'skiing', 'skating', 'cycling', 'running', 'jogging', 'marathon', 'sprint', 'gymnastics', 'athletics', 'yoga', 'aerobics', 'fitness', 'workout', 'athlete', 'coach', 'referee', 'stadium', 'gym', 'gymnasium', 'tournament', 'championship', 'league', 'olympic', 'medal', 'trophy'],
      zh: ['运动', '体育', '竞技', '运动员', '比赛', '锦标赛', '冠军', '竞赛', '教练', '球队', '裁判', '体育场', '健身房', '健身', '锻炼', '训练', '赛跑', '联赛', '奥运', '奖牌', '比分', '选手', '球类', '田径'],
      en: ['sport', 'athletic', 'athlete', 'tournament', 'championship', 'coach', 'referee', 'stadium', 'gymnasium', 'fitness', 'workout', 'olympic', 'league', 'medal', 'trophy', 'marathon'] },
    { id: 'art', name: '艺术文化', group: 'life', desc: '音乐·美术·舞蹈·戏剧·文学',
      words: ['art', 'music', 'musical', 'song', 'melody', 'rhythm', 'harmony', 'tune', 'concert', 'orchestra', 'symphony', 'piano', 'violin', 'guitar', 'drum', 'flute', 'trumpet', 'painting', 'paint', 'drawing', 'sketch', 'portrait', 'sculpture', 'statue', 'canvas', 'gallery', 'museum', 'exhibition', 'dance', 'ballet', 'theater', 'theatre', 'opera', 'drama', 'comedy', 'tragedy', 'poetry', 'poem', 'poet', 'novel', 'fiction', 'prose', 'literature', 'literary', 'author', 'writer', 'cinema', 'movie', 'film', 'actor', 'actress', 'director', 'aesthetic'],
      zh: ['艺术', '美术', '音乐', '绘画', '画家', '雕塑', '舞蹈', '戏剧', '剧院', '歌剧', '诗歌', '诗人', '小说', '文学', '喜剧', '悲剧', '交响', '管弦', '芭蕾', '爵士', '电影', '美学', '审美', '创意', '创作', '展览', '画廊', '博物馆', '杰作', '散文', '韵文', '节奏', '旋律', '和声'],
      en: ['art', 'artistic', 'artist', 'music', 'musical', 'musician', 'painting', 'sculpture', 'sculptor', 'theater', 'theatre', 'opera', 'poetry', 'poem', 'poet', 'novel', 'literature', 'literary', 'drama', 'comedy', 'tragedy', 'symphony', 'orchestra', 'ballet', 'aesthetic', 'aesthetics', 'gallery', 'masterpiece', 'fiction', 'prose', 'verse', 'rhythm', 'melody', 'harmony'] },
    { id: 'society', name: '社会民生', group: 'life', desc: '人口·就业·社保·公共事务',
      words: ['society', 'social', 'community', 'population', 'citizen', 'public', 'civic', 'civilization', 'custom', 'tradition', 'norm', 'value', 'institution', 'organization', 'charity', 'volunteer', 'demographic', 'census', 'employment', 'unemployment', 'labor', 'labour', 'workforce', 'welfare', 'pension', 'insurance', 'poverty', 'inequality', 'discrimination', 'race', 'racial', 'ethnic', 'ethnicity', 'gender', 'immigration', 'immigrant', 'migration', 'urban', 'rural', 'city', 'village', 'homeless', 'crime', 'criminal', 'divorce', 'aging'],
      zh: ['社会', '社区', '人口', '就业', '失业', '劳动', '劳动力', '福利', '社保', '养老金', '保险', '贫困', '不平等', '歧视', '种族', '民族', '性别', '移民', '城市化', '城市', '农村', '乡村', '公民', '公共', '文明', '习俗', '传统', '规范', '价值观', '机构', '组织', '慈善', '志愿者', '公益', '婚姻', '离婚', '老龄化', '犯罪', '民生'],
      en: ['society', 'social', 'community', 'population', 'demographic', 'census', 'welfare', 'pension', 'inequality', 'discrimination', 'racial', 'ethnic', 'gender', 'immigration', 'immigrant', 'migration', 'urban', 'rural', 'citizen', 'citizenship', 'civic', 'civilization', 'custom', 'tradition', 'norm', 'institution', 'organization', 'charity', 'volunteer', 'nonprofit', 'homelessness', 'crime', 'criminal', 'aging'] },
    { id: 'environment', name: '环境生态', group: 'life', desc: '环保·污染·气候·可持续',
      words: ['environment', 'ecology', 'ecosystem', 'pollution', 'pollutant', 'pollute', 'contamination', 'climate', 'greenhouse', 'carbon', 'emission', 'sustainability', 'sustainable', 'renewable', 'conservation', 'biodiversity', 'endangered', 'extinction', 'deforestation', 'recycle', 'recycling', 'waste', 'garbage', 'trash', 'landfill', 'sewage', 'smog', 'ozone', 'habitat', 'wildlife', 'solar', 'hydro', 'geothermal'],
      zh: ['环境', '生态', '生态系统', '污染', '污染物', '气候', '全球变暖', '温室', '碳排放', '排放', '可持续', '可再生', '自然保护', '生物多样性', '濒危', '灭绝', '砍伐', '回收', '废物', '垃圾', '填埋', '污水', '雾霾', '臭氧', '栖息地', '野生', '自然资源', '化石燃料', '太阳能', '风能', '环保'],
      en: ['environment', 'environmental', 'ecology', 'ecological', 'ecosystem', 'pollution', 'pollutant', 'contamination', 'climate', 'greenhouse', 'carbon', 'emission', 'sustainability', 'sustainable', 'renewable', 'conservation', 'biodiversity', 'endangered', 'extinction', 'deforestation', 'recycle', 'recycling', 'landfill', 'sewage', 'smog', 'ozone', 'habitat', 'wildlife', 'fossil fuel', 'solar'] },
    { id: 'history', name: '历史朝代', group: 'life', desc: '朝代·事件·人物·文明',
      words: ['history', 'historical', 'historian', 'ancient', 'medieval', 'renaissance', 'dynasty', 'empire', 'emperor', 'king', 'queen', 'civilization', 'antiquity', 'archaeology', 'artifact', 'relic', 'heritage', 'century', 'era', 'epoch', 'prehistoric', 'colonial', 'colonialism', 'revolution', 'reform', 'monument', 'chronicle', 'ancestry', 'lineage', 'feudal', 'nomad'],
      zh: ['历史', '古代', '中古', '中世纪', '文艺复兴', '朝代', '王朝', '帝国', '皇帝', '国王', '女王', '文明', '考古', '文物', '遗迹', '遗产', '世纪', '时代', '纪元', '史前', '殖民', '革命', '改革', '纪念碑', '编年', '祖先', '世系', '封建', '游牧'],
      en: ['history', 'historical', 'historian', 'ancient', 'medieval', 'renaissance', 'dynasty', 'empire', 'emperor', 'civilization', 'antiquity', 'archaeological', 'archaeology', 'artifact', 'relic', 'heritage', 'era', 'epoch', 'prehistoric', 'colonial', 'colonialism', 'revolution', 'monument', 'chronicle', 'lineage', 'feudal'] },

    // ---------- 经济与科技 ----------
    { id: 'economy', name: '经济金融', group: 'econ', desc: '宏观·货币·银行·投资',
      words: ['economy', 'economic', 'economics', 'economist', 'finance', 'financial', 'monetary', 'money', 'currency', 'bank', 'banking', 'investment', 'invest', 'investor', 'capital', 'inflation', 'deflation', 'recession', 'stock', 'bond', 'security', 'asset', 'liability', 'debt', 'credit', 'loan', 'mortgage', 'tax', 'taxation', 'fiscal', 'budget', 'revenue', 'supply', 'demand', 'wealth', 'income', 'wage', 'salary', 'profit', 'dividend', 'shareholder', 'audit', 'accounting'],
      zh: ['经济', '金融', '财政', '货币', '银行', '投资', '资本', '通胀', '通货膨胀', '通缩', '衰退', '股票', '股市', '债券', '证券', '资产', '负债', '债务', '信贷', '贷款', '抵押', '税收', '预算', '收入', '支出', '供给', '需求', '产业', '生产力', '增长', '繁荣', '财富', '工资', '薪水', '利润', '亏损', '股息', '股东', '审计', '会计'],
      en: ['economy', 'economic', 'economics', 'economist', 'finance', 'financial', 'monetary', 'currency', 'bank', 'banking', 'investment', 'invest', 'investor', 'capital', 'inflation', 'deflation', 'recession', 'stock', 'bond', 'securities', 'asset', 'liability', 'debt', 'credit', 'loan', 'mortgage', 'fiscal', 'budget', 'revenue', 'supply', 'demand', 'wealth', 'income', 'wage', 'profit', 'dividend', 'shareholder', 'audit', 'accounting'] },
    { id: 'business', name: '商业贸易', group: 'econ', desc: '贸易·营销·管理·创业',
      words: ['business', 'commerce', 'commercial', 'trade', 'merchant', 'retail', 'wholesale', 'marketing', 'advertisement', 'advertising', 'brand', 'sales', 'customer', 'consumer', 'client', 'management', 'manager', 'corporate', 'corporation', 'company', 'firm', 'enterprise', 'entrepreneur', 'startup', 'franchise', 'merger', 'acquisition', 'negotiation', 'contract', 'transaction', 'import', 'export', 'tariff', 'logistics', 'inventory', 'warehouse', 'distribution', 'partnership', 'stakeholder', 'turnover', 'bankruptcy', 'accountant'],
      zh: ['商业', '商务', '贸易', '经商', '商人', '零售', '批发', '营销', '广告', '品牌', '销售', '顾客', '消费者', '客户', '管理', '经理', '行政', '公司', '企业', '创业', '初创', '加盟', '合并', '收购', '谈判', '合同', '交易', '进口', '出口', '关税', '供应链', '物流', '库存', '仓库', '分销', '合伙', '股东', '营业额', '破产'],
      en: ['business', 'commerce', 'commercial', 'trade', 'merchant', 'retail', 'wholesale', 'marketing', 'advertisement', 'advertising', 'brand', 'customer', 'consumer', 'management', 'corporate', 'corporation', 'enterprise', 'entrepreneur', 'startup', 'franchise', 'merger', 'acquisition', 'negotiation', 'contract', 'transaction', 'import', 'export', 'tariff', 'logistics', 'inventory', 'warehouse', 'distribution', 'partnership', 'stakeholder', 'turnover', 'bankruptcy'] },
    { id: 'tech', name: '科技数码', group: 'econ', desc: '计算机·互联网·AI·通信',
      words: ['technology', 'technological', 'computer', 'computing', 'software', 'hardware', 'internet', 'website', 'online', 'digital', 'data', 'database', 'algorithm', 'program', 'programming', 'code', 'developer', 'engineer', 'artificial', 'intelligence', 'robot', 'robotics', 'automation', 'semiconductor', 'chip', 'processor', 'electronics', 'electronic', 'device', 'gadget', 'smartphone', 'mobile', 'app', 'server', 'cloud', 'network', 'cybersecurity', 'encryption', 'blockchain', 'virtual', 'sensor', 'satellite', 'telecommunications', 'wireless', 'broadband', 'fiber', 'bandwidth', 'protocol', 'interface', 'platform', 'innovation', 'patent', 'biotechnology', 'nanotechnology', 'genome'],
      zh: ['技术', '科技', '计算机', '电脑', '软件', '硬件', '互联网', '网络', '网站', '在线', '数字', '数据', '数据库', '算法', '程序', '编程', '代码', '开发', '工程师', '工程', '人工智能', '机器学习', '机器人', '自动化', '半导体', '芯片', '处理器', '电子', '设备', '智能手机', '移动', '应用', '服务器', '云计算', '网络安全', '加密', '区块链', '虚拟现实', '增强现实', '传感器', '卫星', '电信', '无线', '宽带', '光纤', '带宽', '协议', '接口', '平台', '创新', '发明', '专利', '生物技术', '纳米', '基因组'],
      en: ['technology', 'technological', 'computer', 'computing', 'software', 'hardware', 'internet', 'website', 'online', 'digital', 'database', 'algorithm', 'program', 'programming', 'developer', 'engineer', 'engineering', 'artificial intelligence', 'robot', 'robotics', 'automation', 'semiconductor', 'microchip', 'processor', 'electronics', 'electronic', 'smartphone', 'server', 'cybersecurity', 'encryption', 'blockchain', 'virtual reality', 'augmented reality', 'sensor', 'satellite', 'telecommunications', 'telecom', 'wireless', 'broadband', 'bandwidth', 'protocol', 'interface', 'innovation', 'invention', 'patent', 'biotechnology', 'nanotechnology', 'genome'] },
    { id: 'policy', name: '政策法律', group: 'econ', desc: '法规·司法·行政·治理',
      words: ['policy', 'law', 'legal', 'legislation', 'legislative', 'legislature', 'regulation', 'regulate', 'regulatory', 'statute', 'decree', 'ordinance', 'justice', 'judicial', 'judiciary', 'court', 'judge', 'trial', 'verdict', 'lawsuit', 'litigation', 'lawyer', 'attorney', 'prosecutor', 'defendant', 'plaintiff', 'penalty', 'punishment', 'prison', 'jail', 'sentence', 'enforcement', 'enforce', 'compliance', 'comply', 'governance', 'govern', 'government', 'administration', 'administrative', 'authority', 'bureau', 'agency', 'department', 'ministry', 'official', 'bureaucracy', 'amendment', 'constitution', 'constitutional'],
      zh: ['政策', '法律', '法规', '立法', '司法', '法院', '法官', '审判', '判决', '诉讼', '律师', '检察官', '被告', '原告', '刑事', '处罚', '惩罚', '罚款', '监狱', '量刑', '执法', '合规', '治理', '政府', '行政', '当局', '官员', '公务员', '官僚', '修正案', '宪法', '权利', '公民权利', '人权', '自由'],
      en: ['policy', 'law', 'legal', 'legislation', 'legislative', 'legislature', 'regulation', 'regulatory', 'statute', 'decree', 'ordinance', 'justice', 'judicial', 'judiciary', 'court', 'judge', 'trial', 'verdict', 'lawsuit', 'litigation', 'lawyer', 'attorney', 'prosecutor', 'defendant', 'plaintiff', 'penalty', 'punishment', 'prison', 'sentence', 'enforcement', 'compliance', 'governance', 'government', 'administration', 'administrative', 'authority', 'bureau', 'agency', 'ministry', 'official', 'bureaucracy', 'amendment', 'constitution', 'constitutional'] },
    { id: 'politics', name: '政治军事', group: 'econ', desc: '政治·外交·国防·战争',
      words: ['politics', 'political', 'politician', 'nation', 'national', 'country', 'republic', 'democracy', 'democratic', 'authoritarian', 'dictatorship', 'dictator', 'regime', 'sovereignty', 'sovereign', 'diplomacy', 'diplomatic', 'diplomat', 'embassy', 'ambassador', 'treaty', 'alliance', 'ally', 'coalition', 'parliament', 'parliamentary', 'congress', 'senate', 'senator', 'election', 'electoral', 'vote', 'voter', 'campaign', 'candidate', 'party', 'ideology', 'liberal', 'conservative', 'socialism', 'communism', 'nationalism', 'patriot', 'military', 'army', 'navy', 'soldier', 'troop', 'weapon', 'war', 'warfare', 'battle', 'combat', 'invasion', 'invade', 'defense', 'strategy', 'strategic', 'nuclear', 'missile', 'commander', 'siege', 'ceasefire', 'peace', 'sanction', 'coup', 'rebellion', 'terrorism', 'terrorist', 'geopolitics', 'border', 'territory'],
      zh: ['政治', '政客', '国家', '民族', '共和国', '民主', '独裁', '专制', '政权', '主权', '外交', '大使', '使馆', '条约', '联盟', '同盟', '议会', '国会', '参议院', '参议员', '众议员', '选举', '投票', '选民', '竞选', '候选人', '政党', '党派', '意识形态', '自由主义', '保守主义', '社会主义', '共产主义', '民族主义', '爱国', '军事', '军队', '陆军', '海军', '空军', '士兵', '部队', '武器', '军备', '战争', '战役', '战斗', '冲突', '入侵', '国防', '防御', '战略', '核武器', '导弹', '将军', '指挥官', '围困', '停火', '停战', '和平', '维和', '制裁', '禁运', '政变', '革命', '叛乱', '恐怖主义', '恐怖分子', '地缘政治', '边境', '领土'],
      en: ['politics', 'political', 'politician', 'nation', 'republic', 'democracy', 'democratic', 'authoritarian', 'dictatorship', 'regime', 'sovereignty', 'diplomacy', 'diplomatic', 'embassy', 'ambassador', 'treaty', 'alliance', 'coalition', 'parliament', 'congress', 'senate', 'election', 'electoral', 'voter', 'candidate', 'ideology', 'liberal', 'conservative', 'socialism', 'communism', 'nationalism', 'military', 'soldier', 'weapon', 'warfare', 'battle', 'combat', 'invasion', 'defense', 'strategic', 'nuclear', 'missile', 'ceasefire', 'peace', 'sanction', 'coup', 'rebellion', 'terrorism', 'terrorist', 'geopolitics', 'territory'] },

    // ---------- 语言与基础 ----------
    { id: 'action', name: '动作行为', group: 'basic', desc: '常见肢体动作与行为动词',
      words: ['walk', 'run', 'jump', 'leap', 'hop', 'skip', 'climb', 'crawl', 'swim', 'dive', 'float', 'sink', 'fall', 'rise', 'stand', 'sit', 'lie', 'kneel', 'crouch', 'bow', 'lean', 'reach', 'touch', 'feel', 'press', 'squeeze', 'rub', 'wipe', 'scratch', 'dig', 'bury', 'cut', 'chop', 'slice', 'tear', 'break', 'smash', 'crush', 'grind', 'mix', 'stir', 'pour', 'spill', 'fill', 'empty', 'open', 'close', 'lock', 'knock', 'wrap', 'fold', 'tie', 'untie', 'bind', 'hang', 'swing', 'bounce', 'throw', 'toss', 'catch', 'grab', 'grasp', 'seize', 'push', 'pull', 'drag', 'lift', 'carry', 'hold', 'drop', 'kick', 'hit', 'strike', 'beat', 'punch', 'slap', 'clap', 'wave', 'shake', 'nod', 'bend', 'stretch', 'twist', 'turn', 'spin', 'roll', 'slide', 'slip', 'chase', 'escape', 'flee', 'hide'],
      zh: [],
      en: [] },
    { id: 'time', name: '时间日期', group: 'basic', desc: '星期·月份·季节·时间',
      words: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'january', 'february', 'april', 'june', 'july', 'september', 'october', 'november', 'december', 'spring', 'summer', 'autumn', 'winter', 'today', 'tomorrow', 'yesterday', 'week', 'weekend', 'weekday', 'month', 'year', 'decade', 'century', 'millennium', 'hour', 'minute', 'second', 'moment', 'dawn', 'dusk', 'sunrise', 'sunset', 'noon', 'midnight', 'morning', 'afternoon', 'evening', 'night', 'season', 'anniversary', 'birthday', 'calendar', 'schedule', 'deadline'],
      zh: ['时间', '时刻', '时候', '星期', '周末', '工作日', '月份', '年代', '世纪', '千年', '小时', '分钟', '秒', '瞬间', '现在', '过去', '未来', '日期', '日历', '日程', '期限', '周年', '生日', '季节', '季度', '年度', '每日', '每周', '每月', '每年', '黎明', '黄昏', '日出', '日落', '正午', '午夜', '早晨', '上午', '下午', '傍晚', '夜晚', '星期几', '时区'],
      en: ['time', 'temporal', 'chronological', 'calendar', 'weekday', 'weekend', 'season', 'annual', 'daily', 'weekly', 'monthly', 'yearly', 'hourly', 'moment', 'instant', 'duration', 'interval', 'era', 'epoch', 'anniversary', 'deadline', 'timetable', 'dawn', 'dusk', 'sunrise', 'sunset', 'noon', 'midnight'] },
    { id: 'number', name: '数字数量', group: 'basic', desc: '数词·量词·度量',
      words: ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety', 'hundred', 'thousand', 'million', 'billion', 'trillion', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'once', 'twice', 'double', 'triple', 'half', 'quarter', 'dozen', 'pair', 'couple', 'percent', 'percentage'],
      zh: ['数字', '数词', '数目', '数量', '数值', '计数', '计算', '算术', '数学', '分数', '小数', '整数', '比率', '比例', '百分比', '百分', '倍数', '乘法', '除法', '加法', '减法', '方程', '公式', '代数', '几何', '统计', '平均', '均值', '中位数', '一半', '半数', '四分之一', '一对', '一双', '一打'],
      en: ['numeral', 'numeric', 'numerical', 'digit', 'arithmetic', 'mathematics', 'mathematical', 'calculation', 'calculate', 'compute', 'fraction', 'decimal', 'integer', 'percentage', 'percent', 'multiple', 'multiplication', 'division', 'addition', 'subtraction', 'equation', 'formula', 'algebra', 'geometry', 'statistics', 'statistical', 'average', 'median', 'dozen', 'quotient', 'dividend', 'divisor'] },
    { id: 'color', name: '颜色', group: 'basic', desc: '色彩·色调·明暗',
      words: ['color', 'colour', 'red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet', 'purple', 'pink', 'brown', 'black', 'white', 'gray', 'grey', 'silver', 'gold', 'golden', 'beige', 'tan', 'cream', 'ivory', 'maroon', 'crimson', 'scarlet', 'turquoise', 'cyan', 'magenta', 'lavender', 'lilac', 'olive', 'teal', 'navy', 'aqua', 'amber', 'coral', 'salmon', 'peach', 'plum', 'ruby', 'emerald', 'sapphire', 'jade', 'bronze', 'copper', 'charcoal', 'blonde', 'brunette', 'colorful', 'pale', 'dark', 'bright', 'dull', 'vivid', 'hue', 'tint', 'shade', 'pigment', 'dye', 'paint', 'rainbow', 'spectrum', 'iridescent', 'translucent', 'transparent', 'opaque', 'glossy', 'shiny', 'radiant'],
      zh: ['颜色', '色彩', '彩色', '色调', '色泽', '颜料', '染料', '调色', '彩虹', '光谱', '虹彩', '荧光', '苍白', '鲜艳', '明亮', '暗淡', '深色', '浅色', '红色', '橙色', '黄色', '绿色', '蓝色', '靛蓝', '紫色', '粉色', '棕色', '黑色', '白色', '灰色', '银色', '金色', '米色', '褐色', '栗色', '绯红', '猩红', '青绿', '青色', '品红', '淡紫', '橄榄', '蓝绿', '海军蓝', '琥珀', '珊瑚', '桃色', '翡翠', '蓝宝石', '青铜', '炭黑', '乌木'],
      en: ['color', 'colour', 'colorful', 'hue', 'tint', 'shade', 'tone', 'pigment', 'dye', 'palette', 'rainbow', 'spectrum', 'iridescent', 'fluorescent', 'pale', 'vivid', 'bright', 'dull', 'dark', 'light'] },
    { id: 'festival', name: '节日庆典', group: 'basic', desc: '中外节日·庆典·纪念日',
      words: ['festival', 'feast', 'celebration', 'celebrate', 'holiday', 'vacation', 'anniversary', 'jubilee', 'centennial', 'commemoration', 'ceremony', 'ritual', 'parade', 'fireworks', 'banquet', 'gala', 'fiesta', 'carnival', 'christmas', 'easter', 'thanksgiving', 'halloween', 'valentine', 'passover', 'hanukkah', 'ramadan', 'diwali', 'holi', 'advent', 'epiphany', 'lent', 'solstice', 'equinox', 'oktoberfest'],
      zh: ['节日', '节庆', '庆典', '庆祝', '假日', '假期', '休假', '周年', '纪念', '纪念日', '典礼', '仪式', '游行', '烟花', '焰火', '宴会', '盛宴', '嘉年华', '庙会', '圣诞', '复活节', '感恩节', '万圣节', '情人节', '愚人节', '母亲节', '父亲节', '独立日', '劳动节', '阵亡将士', '退伍军人', '春节', '新年', '元宵', '清明', '扫墓', '端午', '龙舟', '中秋', '月饼', '重阳', '冬至', '夏至', '春分', '秋分', '狂欢节', '啤酒节', '篝火', '国庆', '开国', '建军', '建党'],
      en: ['festival', 'feast', 'celebration', 'holiday', 'vacation', 'anniversary', 'jubilee', 'centennial', 'commemoration', 'ceremony', 'ritual', 'parade', 'fireworks', 'banquet', 'gala', 'fiesta', 'carnival', 'christmas', 'easter', 'thanksgiving', 'halloween', 'valentine', 'passover', 'hanukkah', 'ramadan', 'diwali', 'holi', 'advent', 'epiphany', 'lent', 'solstice', 'equinox', 'oktoberfest'] }
  ];

  let byTheme = {};      // themeId -> [word]
  let wordThemes = {};   // word -> [themeId]
  let ready = false;

  // Gloss words too generic to prove a topic on their own: they show up in unrelated
  // definitions ("it is dark outside" for night, "very light element" for helium).
  const EN_STOP = new Set(['light', 'dark', 'bright', 'dull', 'pale', 'vivid', 'tone', 'shade',
    'transparent', 'translucent', 'opaque', 'glossy', 'shiny', 'radiant', 'warm', 'cold', 'hot',
    'cool', 'sweet', 'hard', 'soft', 'sharp', 'flat', 'deep', 'high', 'low', 'young', 'old', 'new',
    'large', 'small', 'common', 'general', 'normal', 'special', 'free', 'full', 'empty', 'open',
    'right', 'wrong', 'public', 'private', 'state', 'act', 'action', 'order', 'force', 'field',
    'line', 'part', 'case', 'charge', 'point', 'place', 'thing', 'person', 'people', 'man',
    'woman', 'child', 'work', 'job', 'money', 'company', 'service', 'system', 'group', 'member',
    'area', 'world', 'country', 'nation', 'government', 'law', 'court', 'agency', 'official',
    'time', 'period', 'amount', 'number', 'level', 'rate', 'body', 'head', 'face', 'hand', 'foot',
    'heart', 'blood', 'water', 'food', 'home', 'house', 'family', 'party', 'war', 'peace']);

  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function compile(t) {
    t._zh = (t.zh && t.zh.length) ? t.zh : null;
    // Short gloss words ("bird", "bank", "art") appear in far too many definitions,
    // so only distinctive multi-character terms may vote via the English gloss.
    const en = (t.en || []).filter(k => !EN_STOP.has(k.toLowerCase()) && k.replace(/\s+/g, '').length >= 6);
    t._en = en.length ? new RegExp('\\b(?:' + en.map(escRe).join('|') + ')\\b', 'i') : null;
    t._words = (t.words && t.words.length) ? new Set(t.words.map(w => w.toLowerCase())) : null;
  }

  // A Chinese meaning unit ("野生动 物") matches only as a whole: substring matching made
  // 橄榄球 ("football") count as 橄榄 ("olive") and 雄性动物 drag "he" into animals.
  function zhHit(list, zh) {
    const units = String(zh).split(/[,，、;；]/).map(u => u.replace(/^[a-z]+\.\s*/i, '').replace(/\[[^\]]*\]/g, '').trim()).filter(Boolean);
    if (!units.length) return false;
    // Primary meaning only: "wine" lists 暗红色 as its third sense and must not
    // land in the colour deck because of it.
    const u = units[0];
    return list.some(k => u === k || u.endsWith(k));
  }

  // Gloss inference needs two distinct domain terms in the same definition, because a
  // single incidental mention ("very light element" for helium) is mostly noise.
  function enHits(re, gloss) {
    if (!re || !gloss) return 0;
    const g = re.global ? re : new RegExp(re.source, 'gi');
    let n = 0, m;
    const seen = new Set();
    while ((m = g.exec(gloss))) { const k = m[0].toLowerCase(); if (!seen.has(k)) { seen.add(k); n++; } }
    return n;
  }

  function init(words) {
    byTheme = {}; wordThemes = {};
    const base = THEMES.filter(t => !t.composite);
    base.forEach(compile);
    const entries = Object.keys(words || {});
    for (const w of entries) {
      const d = words[w] || {};
      // Only the first POS branch: secondary senses are what create noise such as
      // "he" (pron. 他 / n. 雄性动物) landing in the animal theme.
      const zh = String(d.zh || '').split('/')[0];
      const en = (d.def && d.def[0] && d.def[0][1]) || '';
      const lw = w.toLowerCase();
      const hits = [];
      for (const t of base) {
        let ok = false;
        if (t._words && t._words.has(lw)) ok = true;
        else if (t._zh && zhHit(t._zh, zh)) ok = true;
        else if (enHits(t._en, en) >= 2) ok = true;
        if (ok) hits.push(t.id);
      }
      if (hits.length) {
        wordThemes[w] = hits;
        hits.forEach(id => { (byTheme[id] = byTheme[id] || []).push(w); });
      }
    }
    // composite exam themes: union of base themes, restricted to CET (四级/六级) words
    for (const t of THEMES.filter(x => x.composite)) {
      const set = new Set();
      t.composite.forEach(id => (byTheme[id] || []).forEach(w => set.add(w)));
      let arr = Array.from(set);
      if (t.cet) arr = arr.filter(w => { const tag = (words[w] || {}).tag || []; return tag.includes('四级') || tag.includes('六级'); });
      arr.sort((a, b) => ((words[a] || {}).fr || 1e9) - ((words[b] || {}).fr || 1e9));
      byTheme[t.id] = arr;
      arr.forEach(w => { (wordThemes[w] = wordThemes[w] || []).push(t.id); });
    }
    // sort base theme words by frequency (common first)
    for (const t of base) {
      (byTheme[t.id] || []).sort((a, b) => ((words[a] || {}).fr || 1e9) - ((words[b] || {}).fr || 1e9));
    }
    ready = true;
  }

  function meta(t) { return { id: t.id, name: t.name, group: t.group, desc: t.desc || '', n: (byTheme[t.id] || []).length }; }
  function list() { return THEMES.map(meta); }
  function groups() {
    return GROUPS.map(g => ({ id: g.id, name: g.name, themes: THEMES.filter(t => t.group === g.id).map(meta) }));
  }
  function get(id) { const t = THEMES.find(x => x.id === id); return t ? meta(t) : null; }
  function wordsOf(id) { return (byTheme[id] || []).slice(); }
  function themesOf(word) { return (wordThemes[word] || []).slice(); }
  function isReady() { return ready; }

  window.Themes = { init, list, groups, get, wordsOf, themesOf, isReady, GROUPS };
})();
