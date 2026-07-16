# frozen_string_literal: true

module MontenegroRoadtrip
  class WaypointPage < Jekyll::Page
    def initialize(site:, waypoint:)
      waypoint_id = waypoint.fetch("id")
      @site = site
      @base = site.source
      @dir = File.join("waypoints", waypoint_id)
      @name = "index.html"

      process(@name)
      self.content = ""
      self.data = {
        "layout" => "waypoint",
        "title" => waypoint["short_name"] || waypoint["name"],
        "description" => waypoint["summary"],
        "waypoint_id" => waypoint_id,
        "waypoint" => waypoint,
        "permalink" => "/waypoints/#{waypoint_id}/"
      }
    end
  end

  class WaypointPageGenerator < Jekyll::Generator
    safe false
    priority :low

    def generate(site)
      waypoint_data = site.data.dig("waypoints", "waypoints")
      return unless waypoint_data.is_a?(Array)

      waypoint_data.each do |waypoint|
        validate_waypoint!(waypoint)
        site.pages << WaypointPage.new(site: site, waypoint: waypoint)
      end
    end

    private

    def validate_waypoint!(waypoint)
      waypoint_id = waypoint["id"]
      return if waypoint_id.is_a?(String) && waypoint_id.match?(/\A[a-z0-9]+(?:-[a-z0-9]+)*\z/)

      raise Jekyll::Errors::FatalException,
            "Every waypoint must have a lowercase kebab-case id; received #{waypoint_id.inspect}."
    end
  end
end
