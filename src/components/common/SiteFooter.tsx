const currentYear = new Date().getFullYear();

const SiteFooter = () => {
  return (
    <footer className="border-t bg-muted/20">
      <div className="container mx-auto px-4 py-10">
        <div className="flex flex-col items-center gap-2 text-center text-xs text-muted-foreground">
          <p className="text-sm text-foreground">© {currentYear} Kadak चाह Private Limited. All rights reserved.</p>
          <p className="max-w-2xl text-muted-foreground/80">
            Purpose-built to keep collections flowing, relationships warm, and every cup accounted for.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default SiteFooter;
