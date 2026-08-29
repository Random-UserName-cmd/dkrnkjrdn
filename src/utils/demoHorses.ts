import { collection, addDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { Horse } from "../types";

export const DEMO_FARM_HORSES: Omit<Horse, "id" | "createdAt" | "updatedAt">[] = [
  {
    name: "Demo Maverick",
    breed: "Thoroughbred",
    age: 6,
    gender: "Gelding",
    color: "Dark Bay",
    paddock: "Training Arena",
    brandingDescription: "M-Star on Left Shoulder",
    brandingLocation: "Left Shoulder",
    brandingDate: "2023-04-10",
    lastShoeingDate: new Date(Date.now() - 14 * 86400000).toISOString().split("T")[0],
    shoeingIntervalWeeks: 6,
    lastVetDate: new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0],
    lastVetNotes: "Peak athletic conditioning. Sound hooves and clear lungs.",
    nextVetDueDate: new Date(Date.now() + 60 * 86400000).toISOString().split("T")[0],
    lastDewormingDate: new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0],
    lastDentalDate: new Date(Date.now() - 180 * 86400000).toISOString().split("T")[0],
    stableNumber: "Demo Barn 1, Stall 1",
    ownerName: "Demo Farm Owner",
    ownerPhone: "+1 (555) 019-2831",
    useClassification: "Show Jumping",
    feedRequirements: "2 scoops performance grain, 3 flakes alfalfa hay",
    activeMedications: "Joint supplement (Cosequin)",
    temperament: "High Energy & Responsive",
    heightHands: "16.2 hh",
    weightLbs: "1,150 lbs",
    farmName: "Demo Farm",
    farmId: "demo_farm"
  },
  {
    name: "Demo Starlight",
    breed: "Arabian",
    age: 8,
    gender: "Mare",
    color: "Dapple Gray",
    paddock: "North Pasture",
    brandingDescription: "Crescent Moon Brand",
    brandingLocation: "Right Hip",
    brandingDate: "2022-09-18",
    lastShoeingDate: new Date(Date.now() - 40 * 86400000).toISOString().split("T")[0], // Near due/warning
    shoeingIntervalWeeks: 6,
    lastVetDate: new Date(Date.now() - 45 * 86400000).toISOString().split("T")[0],
    lastVetNotes: "Routine inspection completed. All vaccines updated.",
    nextVetDueDate: new Date(Date.now() + 45 * 86400000).toISOString().split("T")[0],
    lastDewormingDate: new Date(Date.now() - 45 * 86400000).toISOString().split("T")[0],
    lastDentalDate: new Date(Date.now() - 200 * 86400000).toISOString().split("T")[0],
    stableNumber: "Demo Barn 1, Stall 2",
    ownerName: "Demo Farm Owner",
    ownerPhone: "+1 (555) 019-2831",
    useClassification: "Endurance Riding",
    feedRequirements: "1.5 scoops sweet feed, free choice orchard grass",
    activeMedications: "None",
    temperament: "Gentle & Intelligent",
    heightHands: "15.1 hh",
    weightLbs: "980 lbs",
    farmName: "Demo Farm",
    farmId: "demo_farm"
  },
  {
    name: "Demo Pegasus",
    breed: "Warmblood",
    age: 7,
    gender: "Gelding",
    color: "Chestnut",
    paddock: "Training Arena",
    brandingDescription: "Double Arrow Crest",
    brandingLocation: "Left Thigh",
    brandingDate: "2023-01-20",
    lastShoeingDate: new Date(Date.now() - 50 * 86400000).toISOString().split("T")[0], // Shoeing Alert
    shoeingIntervalWeeks: 6,
    lastVetDate: new Date(Date.now() - 60 * 86400000).toISOString().split("T")[0],
    lastVetNotes: "Healthy vitals, regular dressage stamina review.",
    nextVetDueDate: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
    lastDewormingDate: new Date(Date.now() - 60 * 86400000).toISOString().split("T")[0],
    lastDentalDate: new Date(Date.now() - 240 * 86400000).toISOString().split("T")[0],
    stableNumber: "Demo Barn 1, Stall 3",
    ownerName: "Demo Farm Owner",
    ownerPhone: "+1 (555) 019-2831",
    useClassification: "Dressage",
    feedRequirements: "2 scoops complete feed, oaten hay twice daily",
    activeMedications: "None",
    temperament: "Calm & Focused",
    heightHands: "16.3 hh",
    weightLbs: "1,220 lbs",
    farmName: "Demo Farm",
    farmId: "demo_farm"
  },
  {
    name: "Demo Eclipse",
    breed: "Friesian",
    age: 9,
    gender: "Stallion",
    color: "Jet Black",
    paddock: "South Paddock",
    brandingDescription: "Royal Crown Insignia",
    brandingLocation: "Left Shoulder",
    brandingDate: "2021-11-12",
    lastShoeingDate: new Date(Date.now() - 10 * 86400000).toISOString().split("T")[0],
    shoeingIntervalWeeks: 6,
    lastVetDate: new Date(Date.now() - 20 * 86400000).toISOString().split("T")[0],
    lastVetNotes: "Excellent coat condition and hoof integrity.",
    nextVetDueDate: new Date(Date.now() + 90 * 86400000).toISOString().split("T")[0],
    lastDewormingDate: new Date(Date.now() - 20 * 86400000).toISOString().split("T")[0],
    lastDentalDate: new Date(Date.now() - 120 * 86400000).toISOString().split("T")[0],
    stableNumber: "Demo Barn 2, Stall 1",
    ownerName: "Demo Farm Owner",
    ownerPhone: "+1 (555) 019-2831",
    useClassification: "Exhibition & Breeding",
    feedRequirements: "2.5 scoops high-protein ration, Timothy hay",
    activeMedications: "Biotin Hoof Formula",
    temperament: "Majestic & Well-Mannered",
    heightHands: "16.1 hh",
    weightLbs: "1,300 lbs",
    farmName: "Demo Farm",
    farmId: "demo_farm"
  },
  {
    name: "Demo Willow",
    breed: "Quarter Horse",
    age: 5,
    gender: "Mare",
    color: "Palomino",
    paddock: "North Pasture",
    brandingDescription: "W-Bar Brand",
    brandingLocation: "Right Shoulder",
    brandingDate: "2023-08-05",
    lastShoeingDate: new Date(Date.now() - 38 * 86400000).toISOString().split("T")[0],
    shoeingIntervalWeeks: 6,
    lastVetDate: new Date(Date.now() - 15 * 86400000).toISOString().split("T")[0],
    lastVetNotes: "Great temperament, ideal for trail and instructional lessons.",
    nextVetDueDate: new Date(Date.now() + 75 * 86400000).toISOString().split("T")[0],
    lastDewormingDate: new Date(Date.now() - 15 * 86400000).toISOString().split("T")[0],
    lastDentalDate: new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0],
    stableNumber: "Demo Barn 2, Stall 2",
    ownerName: "Demo Farm Owner",
    ownerPhone: "+1 (555) 019-2831",
    useClassification: "Trail & Riding Lessons",
    feedRequirements: "1 scoop maintenance pellet, meadow hay",
    activeMedications: "None",
    temperament: "Sweet & Patient",
    heightHands: "15.0 hh",
    weightLbs: "1,050 lbs",
    farmName: "Demo Farm",
    farmId: "demo_farm"
  }
];

export async function ensureDemoHorsesExist(): Promise<void> {
  try {
    const q = query(
      collection(db, "horses"),
      where("farmId", "==", "demo_farm")
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      const todayStr = new Date().toISOString().split("T")[0];
      for (const horseData of DEMO_FARM_HORSES) {
        const docRef = await addDoc(collection(db, "horses"), {
          ...horseData,
          createdAt: todayStr,
          updatedAt: todayStr
        });

        // Add initial shoeing log
        await addDoc(collection(db, `horses/${docRef.id}/logs`), {
          horseId: docRef.id,
          horseName: horseData.name,
          type: "shoeing",
          date: horseData.lastShoeingDate,
          notes: "Demo shoeing and balance trim.",
          performedBy: "Farrier Bob",
          cost: 110.00,
          createdAt: todayStr,
          loggedBy: "Demo System"
        });

        // Add initial vet log
        await addDoc(collection(db, `horses/${docRef.id}/logs`), {
          horseId: docRef.id,
          horseName: horseData.name,
          type: "vet",
          date: horseData.lastVetDate,
          notes: horseData.lastVetNotes,
          performedBy: "Dr. Catherine Adams",
          cost: 180.00,
          nextDueDate: horseData.nextVetDueDate,
          createdAt: todayStr,
          loggedBy: "Demo System"
        });
      }
    }
  } catch (err) {
    console.error("Error ensuring demo horses:", err);
  }
}

export const DELTA_FARM_HORSES: Omit<Horse, "id" | "createdAt" | "updatedAt">[] = [
  {
    name: "Delta Ranger",
    breed: "Australian Stock Horse",
    age: 7,
    gender: "Gelding",
    color: "Bay",
    paddock: "Delta Valley Pasture",
    brandingDescription: "Delta Triangle Brand",
    brandingLocation: "Right Shoulder",
    brandingDate: "2022-05-14",
    lastShoeingDate: new Date(Date.now() - 10 * 86400000).toISOString().split("T")[0],
    shoeingIntervalWeeks: 6,
    lastVetDate: new Date(Date.now() - 25 * 86400000).toISOString().split("T")[0],
    lastVetNotes: "Sound hoof structure and healthy joints. Routine check clear.",
    nextVetDueDate: new Date(Date.now() + 65 * 86400000).toISOString().split("T")[0],
    lastDewormingDate: new Date(Date.now() - 25 * 86400000).toISOString().split("T")[0],
    lastDentalDate: new Date(Date.now() - 150 * 86400000).toISOString().split("T")[0],
    stableNumber: "Delta Stable 1",
    ownerName: "Delta Farm Owner",
    ownerPhone: "+1 (555) 345-6789",
    useClassification: "Working Stock & Cattle",
    feedRequirements: "2 scoops pasture blend, lucerne hay",
    activeMedications: "None",
    temperament: "Reliable & Hardworking",
    heightHands: "15.3 hh",
    weightLbs: "1,120 lbs",
    farmName: "Delta Farm",
    farmId: "delta_farm"
  },
  {
    name: "Delta Sapphire",
    breed: "Warmblood",
    age: 5,
    gender: "Mare",
    color: "Chestnut",
    paddock: "Delta North Arena",
    brandingDescription: "Diamond Delta Mark",
    brandingLocation: "Left Thigh",
    brandingDate: "2023-09-01",
    lastShoeingDate: new Date(Date.now() - 18 * 86400000).toISOString().split("T")[0],
    shoeingIntervalWeeks: 6,
    lastVetDate: new Date(Date.now() - 40 * 86400000).toISOString().split("T")[0],
    lastVetNotes: "Show jumping conditioning test passed. Vaccinations up to date.",
    nextVetDueDate: new Date(Date.now() + 50 * 86400000).toISOString().split("T")[0],
    lastDewormingDate: new Date(Date.now() - 40 * 86400000).toISOString().split("T")[0],
    lastDentalDate: new Date(Date.now() - 180 * 86400000).toISOString().split("T")[0],
    stableNumber: "Delta Stable 2",
    ownerName: "Delta Farm Owner",
    ownerPhone: "+1 (555) 345-6789",
    useClassification: "Show Jumping",
    feedRequirements: "2.5 scoops sweet grain mix, oaten hay",
    activeMedications: "Electrolyte replacement",
    temperament: "Athletic & Spirited",
    heightHands: "16.2 hh",
    weightLbs: "1,200 lbs",
    farmName: "Delta Farm",
    farmId: "delta_farm"
  },
  {
    name: "Delta Thunder",
    breed: "Thoroughbred",
    age: 8,
    gender: "Gelding",
    color: "Dark Brown",
    paddock: "Delta South Meadow",
    brandingDescription: "Delta Lightning Bolt",
    brandingLocation: "Left Shoulder",
    brandingDate: "2021-03-20",
    lastShoeingDate: new Date(Date.now() - 35 * 86400000).toISOString().split("T")[0],
    shoeingIntervalWeeks: 6,
    lastVetDate: new Date(Date.now() - 15 * 86400000).toISOString().split("T")[0],
    lastVetNotes: "Excellent cardiovascular health and stamina score.",
    nextVetDueDate: new Date(Date.now() + 75 * 86400000).toISOString().split("T")[0],
    lastDewormingDate: new Date(Date.now() - 15 * 86400000).toISOString().split("T")[0],
    lastDentalDate: new Date(Date.now() - 120 * 86400000).toISOString().split("T")[0],
    stableNumber: "Delta Stable 3",
    ownerName: "Delta Farm Owner",
    ownerPhone: "+1 (555) 345-6789",
    useClassification: "Eventing & Cross Country",
    feedRequirements: "2 scoops high-energy pellet, free-choice pasture",
    activeMedications: "Joint supplement",
    temperament: "Bold & Responsive",
    heightHands: "16.1 hh",
    weightLbs: "1,180 lbs",
    farmName: "Delta Farm",
    farmId: "delta_farm"
  }
];

export async function ensureDeltaFarmExists(): Promise<void> {
  try {
    const q = query(
      collection(db, "horses"),
      where("farmId", "==", "delta_farm")
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      const todayStr = new Date().toISOString().split("T")[0];
      for (const horseData of DELTA_FARM_HORSES) {
        const docRef = await addDoc(collection(db, "horses"), {
          ...horseData,
          createdAt: todayStr,
          updatedAt: todayStr
        });

        await addDoc(collection(db, `horses/${docRef.id}/logs`), {
          horseId: docRef.id,
          horseName: horseData.name,
          type: "shoeing",
          date: horseData.lastShoeingDate,
          notes: "Initial farrier shoeing on Delta Farm.",
          performedBy: "Farrier Team",
          cost: 120.00,
          createdAt: todayStr,
          loggedBy: "Delta Farm System"
        });

        await addDoc(collection(db, `horses/${docRef.id}/logs`), {
          horseId: docRef.id,
          horseName: horseData.name,
          type: "vet",
          date: horseData.lastVetDate,
          notes: horseData.lastVetNotes,
          performedBy: "Equine Veterinary Care",
          cost: 160.00,
          nextDueDate: horseData.nextVetDueDate,
          createdAt: todayStr,
          loggedBy: "Delta Farm System"
        });
      }
    }
  } catch (err) {
    console.error("Error ensuring Delta Farm horses:", err);
  }
}
