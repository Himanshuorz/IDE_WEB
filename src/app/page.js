import Navbar from "./components/Navbar/Navbar";
import Hero from "./components/Hero/Hero";
import ProblemSolution from "./components/ProblemSolution/ProblemSolution";
import Features from "./components/Features/Features";
import TechStack from "./components/TechStack/TechStack";
import Footer from "./components/Footer/Footer";

export default function Home() {
  return (
    <>
      <Navbar />
      <Hero />
      <ProblemSolution />
      <Features />
      <TechStack />
      <Footer />
    </>
  );
}
